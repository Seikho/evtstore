import * as neo from 'neo4j-driver'
import { ErrorCallback, Event, Provider } from '../src/types'
import { VersionError } from './error'
import { createEventsMapper, toArray } from './util'

export type Bookmark = {
  bookmark: string

  /** datetime.realtime() */
  position: string
}

export type Options = {
  limit?: number
  client: neo.Driver | Promise<neo.Driver>
  onError?: ErrorCallback

  /** Bookmarks label */
  bookmarks: string

  /** Events label */
  events: string
}

export type MigrateOptions = {
  client: neo.Driver | Promise<neo.Driver>
  bookmarks: string
  events: string
}

export function createProvider<E extends Event>(opts: Options): Provider<E> {
  const onError = opts.onError || noop
  const client = opts.client
  const run = <T = unknown>(query: string, params?: {}) => cypher<T>(client, query, params)

  return {
    limit: opts.limit,
    driver: 'neo4j-v3',
    onError,
    getPosition: async (bm) => {
      const [pos] = await run<Bookmark>(
        `MATCH (bm: ${opts.bookmarks} { bookmark: $bm }) RETURN bm`,
        { bm }
      )
      if (pos === undefined) return 0
      return toInternalPosition(pos.position)
    },
    setPosition: async (bm, pos) => {
      const position = toNeoPosition(pos)
      await run(
        `
        MERGE (bm: ${opts.bookmarks} { bookmark: $bm })
        ON CREATE SET bm.position = $position
        ON MATCH SET bm.position = $position
      `,
        { bm, position }
      )
    },
    getEventsFor: async (stream, id, from) => {
      const params: any = {
        stream,
        id,
        from: toNeoPosition(from),
      }
      let query = `
        MATCH (ev: ${opts.events})
        WHERE ev.aggregateId = $id
        AND ev.position > datetime($from)
        AND ev.stream = $stream 
      `
      const limit = opts.limit ? `LIMIT ${opts.limit}` : ''

      const events = await run<any>(`${query} RETURN ev ORDER BY ev.position ASC ${limit}`, params)

      const parsed = events.map((ev) => ({
        stream: ev.stream,
        position: toInternalPosition(ev.position),
        version: toVersion(ev.version),
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    getLastEventFor: async (stream, id) => {
      const streams = toArray(stream).map((stream) => `'${stream}'`)
      const params: any = {}

      let query = `
        MATCH (ev: ${opts.events})
        WHERE ev.stream IN [${streams.join(', ')}]`

      if (id) {
        query += ` AND ev.aggregateId = $id`
        params.id = id
      }

      const events = await run<any>(`${query} RETURN ev ORDER BY ev.position DESC LIMIT 1`, params)

      const parsed = events.map((ev) => ({
        stream: ev.stream,
        position: toInternalPosition(ev.position),
        version: toVersion(ev.version),
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed[0]
    },
    getEventsFrom: async (stream, pos, lim) => {
      const streams = toArray(stream).map((stream) => `'${stream}'`)
      const params: any = { pos: toNeoPosition(pos) }
      const query = `
        MATCH (ev: ${opts.events})
        WHERE ev.stream IN [${streams.join(', ')}]
        AND ev.position > datetime($pos)
      `
      const limit = lim ?? opts.limit ? `LIMIT ${opts.limit}` : ''

      const events = await run<any>(`${query} RETURN ev ORDER BY ev.position ASC ${limit}`, params)

      const parsed = events.map((ev) => ({
        stream: ev.stream,
        position: toInternalPosition(ev.position),
        version: toVersion(ev.version),
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    createEvents: createEventsMapper<E>(0),
    append: async (stream, id, _version, newEvents) => {
      const client = await opts.client

      for (const event of newEvents) {
        try {
          await cypher(
            client,
            `
            WITH datetime.transaction() as curr, $stream + "_" + toString(datetime.transaction()) as streampos
            CREATE (ev: ${opts.events} {
              stream: $stream,
              position: curr,
              version: $version,
              timestamp: datetime($timestamp),
              aggregateId: $id,
              event: $event,
              _streamPosition: streampos,
              _streamIdVersion: $streamIdVersion
    
            }) RETURN ev
          `,
            {
              stream,
              id,
              version: event.version,
              timestamp: event.timestamp.toISOString(),
              event: JSON.stringify(event.event),
              streamIdVersion: `${stream}_${id}_${event.version}`,
            }
          )
        } catch (ex: any) {
          if (ex instanceof neo.Neo4jError === false) throw ex
          if (ex.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
            throw new VersionError(ex.message)
          }
          throw ex
        }
      }
      return newEvents
    },
  }
}

export async function migrate(opts: MigrateOptions) {
  const cli = await opts.client
  const session = cli.session({ defaultAccessMode: 'WRITE' })

  const trx = session.beginTransaction()

  await trx.run(`CREATE INDEX ON :${opts.events}(stream, position)`)

  await trx.run(`CREATE INDEX ON :${opts.events}(stream, aggregateId, position)`)

  await trx.run(`CREATE CONSTRAINT ON (ev: ${opts.events}) ASSERT ev._streamPos IS UNIQUE`)

  await trx.run(`CREATE CONSTRAINT ON (ev: ${opts.events}) ASSERT ev._streamIdVersion IS UNIQUE`)

  await trx.commit()
  await session.close()
}

export async function cypher<T = unknown>(
  client: neo.Driver | Promise<neo.Driver>,
  query: string,
  params?: {}
) {
  const cli = await client
  const session = cli.session({ defaultAccessMode: 'WRITE' })
  const response = await session.run(query, params)
  await session.close()

  // Unfortunately the type definitions in neo4j-driver are weak and don't
  // allow us to do any better here
  const objects: any[] = response.records.map((record) => record.toObject())
  const results: T[] = []

  for (const row of objects) {
    let obj: any = {}
    for (const key in row) {
      if (row[key]?.properties === undefined) {
        obj[sanitise(key)] = row[key]
        continue
      }

      Object.assign(obj, row[key].properties)
    }
    results.push(obj)
  }

  return results
}

function sanitise(key: string) {
  const last = key.split('.').slice(-1)[0]
  return last
}

function noop() {}

function toVersion(value: any) {
  return neo.isInt(value) ? value.toInt() : value
}

function toNeoPosition(position: any) {
  if (!position) {
    return new Date(0).toISOString()
  }

  if (typeof position === 'number') {
    return new Date(position).toISOString()
  }

  if (position instanceof Date) {
    return position.toISOString()
  }

  return position
}

function toInternalPosition(position: any) {
  if (neo.isDateTime(position) || typeof position === 'string') {
    return new Date(position.toString()).valueOf()
  }

  if (isNaN(position)) return 0

  return position
}

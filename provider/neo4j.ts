import * as neo from 'neo4j-driver'
import { ErrorCallback, Event, Provider, StoreEvent } from '../src/types'
import { VersionError } from './error'

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
    driver: 'neo4j',
    onError,
    getPosition: async (bm) => {
      const [pos] = await run<Bookmark>(
        `MATCH (bm: ${opts.bookmarks} { bookmark: $bm }) RETURN bm`,
        { bm }
      )
      if (pos === undefined) return 0
      return pos.position
    },
    setPosition: async (bm, pos) => {
      await run(
        `
        MERGE (bm: ${opts.bookmarks} { bookmark: $bm })
        ON CREATE SET bm.position = $pos
        ON MATCH SET bm.position = $pos
      `,
        { bm, pos }
      )
    },
    getEventsFor: async (stream, id, from) => {
      const params: any = { stream, id, from: from || new Date(0).toISOString() }
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
        position: ev.position,
        version: toNumber(ev.version),
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    getEventsFrom: async (stream, pos, lim) => {
      const streams = (Array.isArray(stream) ? stream : [stream]).map((stream) => `'${stream}'`)
      const params: any = { pos: !pos ? new Date(0).toISOString() : pos }
      const query = `
        MATCH (ev: ${opts.events})
        WHERE ev.stream IN [${streams.join(', ')}]
        AND ev.position > datetime($pos)
      `
      const limit = lim ?? opts.limit ? `LIMIT ${opts.limit}` : ''

      const events = await run<any>(
        `
        ${query} RETURN ev ORDER BY ev.position ASC ${limit}
      `,
        params
      )

      const parsed = events.map((ev) => ({
        stream: ev.stream,
        position: ev.position,
        version: toNumber(ev.version),
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    append: async (stream, id, version, newEvents) => {
      const client = await opts.client

      const storeEvents: StoreEvent<E>[] = newEvents.map((event, i) => ({
        stream,
        event,
        aggregateId: id,
        version: version + i,
        position: 0,
        timestamp: new Date(Date.now()),
      }))
      for (const event of storeEvents) {
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
        } catch (ex) {
          if (ex instanceof neo.Neo4jError === false) throw ex
          if (ex.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
            throw new VersionError(ex.message)
          }
          throw ex
        }
      }
      return storeEvents
    },
  }
}

export async function migrate(opts: MigrateOptions) {
  const cli = await opts.client
  const session = await cli.session({ defaultAccessMode: 'WRITE' })
  const trx = session.beginTransaction()

  await trx.run(`
    CREATE INDEX ${opts.events}_stream_position
    IF NOT EXISTS
    FOR (ev: ${opts.events})
    ON (ev.stream, ev.position)
  `)

  await trx.run(`
    CREATE INDEX ${opts.events}_stream_id_pos
    IF NOT EXISTS
    FOR (ev: ${opts.events})
    ON (ev.stream, ev.aggregateId, ev.position)
  `)

  await trx.run(`
    CREATE CONSTRAINT ${opts.events}_streampos_unique
    IF NOT EXISTS
    ON (ev: ${opts.events})
    ASSERT ev._streamPos IS UNIQUE
  `)

  await trx.run(`
    CREATE CONSTRAINT ${opts.events}_streamidversion_unique
    IF NOT EXISTS
    ON (ev: ${opts.events})
    ASSERT ev._streamIdVersion IS UNIQUE
  `)

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

function toNumber(value: any) {
  return neo.isInt(value) ? value.toInt() : value
}

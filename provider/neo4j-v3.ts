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
  session: neo.Session | Promise<neo.Session>
  onError?: ErrorCallback

  /** Bookmarks label */
  bookmarks: string

  /** Events label */
  events: string
}

export type MigrateOptions = {
  session: neo.Session | Promise<neo.Session>
  bookmarks: string
  events: string
}

export function createProvider<E extends Event>(opts: Options): Provider<E> {
  const onError = opts.onError || noop
  const session = opts.session
  const run = <T = unknown>(query: string, params?: {}) => cypher<T>(session, query, params)

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
        version: ev.version,
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    getEventsFrom: async (stream, pos) => {
      const streams = (Array.isArray(stream) ? stream : [stream]).map((stream) => `'${stream}'`)
      const params: any = { pos: !pos ? new Date(0).toISOString() : pos }
      const query = `
        MATCH (ev: ${opts.events})
        WHERE ev.stream IN [${streams.join(', ')}]
        AND ev.position > datetime($pos)
      `
      const limit = opts.limit ? `LIMIT ${opts.limit}` : ''

      const events = await run<any>(
        `
        ${query} RETURN ev ORDER BY ev.position ASC ${limit}
      `,
        params
      )

      const parsed = events.map((ev) => ({
        stream: ev.stream,
        position: ev.position,
        version: ev.version,
        timestamp: new Date(ev.timestamp),
        aggregateId: ev.aggregateId,
        event: JSON.parse(ev.event),
      }))

      return parsed
    },
    append: async (stream, id, version, newEvents) => {
      const sess = await opts.session

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
            sess,
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
  const session = await opts.session
  try {
    const trx = session.beginTransaction()

    await trx.run(`CREATE INDEX ON :${opts.events}(stream, position)`)

    await trx.run(`CREATE INDEX ON :${opts.events}(stream, aggregateId, position)`)

    await trx.run(`CREATE CONSTRAINT ON (ev: ${opts.events}) ASSERT ev._streamPos IS UNIQUE`)

    await trx.run(`CREATE CONSTRAINT ON (ev: ${opts.events}) ASSERT ev._streamIdVersion IS UNIQUE`)

    await trx.commit()
  } catch (ex) {
    console.log('Failed to V3 migrate')
    throw ex
  }
}

export async function cypher<T = unknown>(
  session: neo.Session | Promise<neo.Session>,
  query: string,
  params?: {}
) {
  const sess = await session
  const response = await sess.run(query, params)

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

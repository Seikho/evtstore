import { Sql } from 'postgres'
import { Event, Provider, StoreEvent, ErrorCallback } from '../src/types'
import { VersionError } from './error'

export type Bookmark = {
  bookmark: string
  position: number
}

export type MigrateOptions = {
  sql: Sql<any>
  events?: string
  bookmarks?: string
}

export type MigrateClientOptions = Omit<MigrateOptions, 'client'> & { client: Sql<any> }

export type Options = {
  limit?: number
  onError?: ErrorCallback
  sql: Sql<any>
  bookmarks: string
  events: string
}

export function createProvider<E extends Event>(opts: Options): Provider<E> {
  const { sql, bookmarks: bms, events: evts } = opts
  const onError =
    opts.onError ||
    (() => {
      /* NOOP */
    })
  return {
    limit: opts.limit,
    driver: 'postgres',
    onError,
    getPosition: async (bm) => {
      const result = await sql`SELECT * FROM ${sql(bms)} WHERE bookmark = ${bm} LIMIT 1`

      if (result[0]) return result[0].position
      return 0
    },
    setPosition: async (bm, pos) => {
      const result = await sql`UPDATE ${sql(bms)} SET position = ${pos} WHERE bookmark = ${bm}`

      if (result.count === 0) {
        await sql`INSERT INTO ${sql(bms)} (bookmark, position) VALUES (${bm}, ${pos})`
      }
    },
    getEventsFor: async (stream, aggregateId, fromPosition) => {
      const from = fromPosition ? sql`AND position > ${fromPosition}` : sql``
      const result = await sql`SELECT * FROM ${sql(evts)}
        WHERE stream = ${stream}
        AND aggregate_id = ${aggregateId} ${from}
        ORDER BY version asc`

      return result.map(mapToEvent)
    },
    getLastEventFor: async (stream, aggregateId) => {
      const streams = Array.isArray(stream) ? stream : [stream]
      const agg = aggregateId ? sql`AND aggregate_id = ${aggregateId}` : sql``
      const result = await sql`select * from ${sql(evts)} where stream in (${sql(
        streams
      )}) ${agg} order by position desc limit 1`

      return result.map(mapToEvent)[0]
    },
    getEventsFrom: async (stream, position, lim) => {
      const streams = Array.isArray(stream) ? stream : [stream]
      const limit = lim ?? opts.limit
      const limitClause = limit ? sql`LIMIT ${limit}` : sql``

      const result = await sql`SELECT * FROM ${sql(evts)} WHERE stream IN ${sql(
        streams
      )} AND position > ${position} ORDER BY position ASC ${limitClause}`

      return result.map(mapToEvent)
    },
    append: async (stream, aggregateId, version, newEvents) => {
      const timestamp = new Date(Date.now())
      try {
        const result = await sql.begin(async (sql) => {
          const storeEvents: Array<StoreEvent<E>> = newEvents.map((event, i) => ({
            stream,
            event,
            aggregateId,
            version: version + i,
            position: 0,
            timestamp,
          }))

          const toInsert = toStorableEvents(
            stream,
            aggregateId,
            version,
            timestamp.toISOString(),
            newEvents
          )

          const result = await sql`insert into ${sql(evts)} ${sql(
            toInsert,
            'stream',
            'aggregate_id',
            'event',
            'version',
            'timestamp'
          )} returning position`

          for (let i = 0; i < result.length; i++) {
            storeEvents[i].position = Number(result[i].position)
          }

          return storeEvents
        })
        return result
      } catch (ex: any) {
        // TODO: Verify version conflict error
        throw new VersionError(ex.message)
      }
    },
  }
}

function toStorableEvents(
  stream: string,
  aggregate_id: string,
  version: number,
  timestamp: string,
  events: any[]
) {
  const appendable: Array<{
    stream: string
    aggregate_id: string
    version: number
    event: string
    timestamp: string
  }> = []
  for (let i = 0; i < events.length; i++) {
    appendable.push({
      stream,
      aggregate_id,
      version: version + i,
      event: JSON.stringify(events[i]),
      timestamp,
    })
  }
  return appendable
}

/** Migrate using a PG.Pool object */
export async function migrate(opts: MigrateOptions) {
  const { bookmarks, events } = opts
  if (!bookmarks || !events) return

  try {
    await opts.sql.begin(async (sql) => {
      await sql`CREATE TABLE ${sql(bookmarks)} (
        bookmark text PRIMARY KEY,
        position bigint
      )`

      await sql`
        CREATE TABLE ${sql(events)} (
          position BIGSERIAL PRIMARY KEY,
          version integer,
          stream text,
          aggregate_id text,
          timestamp timestamptz,
          event text
        )`
      await sql`CREATE UNIQUE INDEX events_stream_position_unique ON ${sql(events)} (
        stream, position
      )`

      await sql`CREATE UNIQUE INDEX events_stream_aggregate_version_unique ON ${sql(events)} (
        stream, aggregate_id, version
      )`
    })
  } catch (ex) {
    throw ex
  }
}

function mapToEvent<E extends Event = any>(row: any): StoreEvent<E> {
  return {
    aggregateId: row.aggregate_id,
    event: JSON.parse(row.event),
    position: row.position,
    stream: row.stream,
    timestamp: row.timestamp,
    version: row.version,
  }
}

import { Pool, Client } from 'pg'
import { Event, Provider, StoreEvent, ErrorCallback } from '../src/types'
import { VersionError } from './error'

export type Bookmark = {
  bookmark: string
  position: number
}

export type MigrateOptions = {
  client: Pool
  events?: string
  bookmarks?: string
}

export type MigrateClientOptions = Omit<MigrateOptions, 'client'> & { client: Client }

export type Options = {
  limit?: number
  onError?: ErrorCallback
  client: Pool
  bookmarks: string
  events: string
}

export function createProvider<E extends Event>(opts: Options): Provider<E> {
  const onError =
    opts.onError ||
    (() => {
      /* NOOP */
    })
  return {
    limit: opts.limit,
    driver: 'pg',
    onError,
    getPosition: async (bm) => {
      const result = await opts.client.query(
        `select * from "${opts.bookmarks}" where bookmark = $1 limit 1`,
        [bm]
      )
      if (result.rows[0]) return result.rows[0].position
      return 0
    },
    setPosition: async (bm, pos) => {
      const result = await opts.client.query(
        `update "${opts.bookmarks}" set position = $1 where bookmark = $2`,
        [pos, bm]
      )
      if (result.rowCount === 0) {
        await opts.client.query(
          `insert into "${opts.bookmarks}" (bookmark, position) values ($1, $2)`,
          [bm, pos]
        )
      }
    },
    getEventsFor: async (stream, aggregateId, fromPosition) => {
      let query = `select * from "${opts.events}" where stream = $1 and aggregate_id = $2`
      const values = [stream, aggregateId]

      if (fromPosition !== undefined) {
        query += ` and position > $3`
        values.push(fromPosition)
      }

      query += ` order by version asc`

      const result = await opts.client.query(query, values)
      return result.rows.map(mapToEvent)
    },
    getLastEventFor: async (stream, aggregateId) => {
      const streams = Array.isArray(stream) ? stream : [stream]
      const params = streams.map((_, i) => `$${i + 1}`).join(', ')

      let query = `select * from "${opts.events}" where stream in (${params})`
      const values = [...streams]

      if (aggregateId) {
        query += ` and aggregate_id = $${streams.length + 1}`
        values.push(aggregateId)
      }

      query += ` order by position desc limit 1`

      const result = await opts.client.query(query, values)
      return result.rows.map(mapToEvent)[0]
    },
    getEventsFrom: async (stream, position, lim) => {
      const streams = Array.isArray(stream) ? stream : [stream]
      const params = streams.map((_, i) => `$${i + 1}`).join(', ')
      const last = `$${streams.length + 1}`
      let q = `select * from "${opts.events}" where stream in (${params}) and position > ${last} order by position asc`
      const values = [...streams, position]

      const limit = lim ?? opts.limit
      if (limit) {
        q += ` limit $${streams.length + 2}`
        values.push(limit)
      }

      const result = await opts.client.query(q, values)
      return result.rows.map(mapToEvent)
    },
    append: async (stream, aggregateId, version, newEvents) => {
      const trx = await opts.client.connect()
      try {
        await trx.query('BEGIN')
        const storeEvents: Array<StoreEvent<E>> = newEvents.map((event, i) => ({
          stream,
          event,
          aggregateId,
          version: version + i,
          position: 0,
          timestamp: new Date(Date.now()),
        }))

        const toInsert = storeEvents.map((storeEvent) => [
          storeEvent.stream,
          storeEvent.aggregateId,
          JSON.stringify(storeEvent.event),
          storeEvent.version,
          storeEvent.timestamp.toISOString(),
        ])

        let index = 0
        for (const insert of toInsert) {
          const result = await trx.query(
            `insert into "${opts.events}" (stream, aggregate_id, event, version, timestamp) values (
            $1, $2, $3, $4, $5
          ) returning position`,
            insert
          )
          storeEvents[index].position = Number(result.rows[0].position)
          index++
        }

        await trx.query('COMMIT')

        return storeEvents
      } catch (ex: any) {
        await trx.query('ROLLBACK')
        // TODO: Verify version conflict error
        throw new VersionError(ex.message)
      } finally {
        trx.release()
      }
    },
  }
}

/** Migrate using a PG.Pool object */
export async function migrate(opts: MigrateOptions) {
  if (!opts.bookmarks && !opts.events) return

  const trx = await opts.client.connect()

  try {
    await trx.query('BEGIN')
    await trx.query(
      `
      CREATE TABLE "${opts.bookmarks}" (
        bookmark text PRIMARY KEY,
        position bigint
      )
    `
    )

    await trx.query(
      `
      CREATE TABLE "${opts.events}" (
        position BIGSERIAL PRIMARY KEY,
        version integer,
        stream text,
        aggregate_id text,
        timestamp timestamptz,
        event text
      )
    `
    )

    await trx.query(
      `CREATE UNIQUE INDEX events_stream_position_unique ON "${opts.events}" (
      stream, position
    )`
    )

    await trx.query(`CREATE UNIQUE INDEX events_stream_aggregate_version_unique ON "${opts.events}" (
      stream, aggregate_id, version
    )`)

    await trx.query('COMMIT')
  } catch (ex) {
    await trx.query('ROLLBACK')
  } finally {
    trx.release()
  }
}

/** Migrate using a PG.Pool object */
export function migratePool(opts: MigrateOptions) {
  return migrate(opts)
}

/** Migrate using a PG.Client object */
export async function migrateClient(opts: MigrateClientOptions) {
  if (!opts.bookmarks && !opts.events) return

  const client = opts.client

  try {
    await client.query('BEGIN')
    await client.query(
      `
      CREATE TABLE "${opts.bookmarks}" (
        bookmark text PRIMARY KEY,
        position bigint
      )
    `
    )

    await client.query(
      `
      CREATE TABLE "${opts.events}" (
        position BIGSERIAL PRIMARY KEY,
        version integer,
        stream text,
        aggregate_id text,
        timestamp timestamptz,
        event text
      )
    `
    )

    await client.query(
      `CREATE UNIQUE INDEX events_stream_position_unique ON "${opts.events}" (
      stream, position
    )`
    )

    await client.query(`CREATE UNIQUE INDEX events_stream_aggregate_version_unique ON "${opts.events}" (
      stream, aggregate_id, version
    )`)

    await client.query('COMMIT')
  } catch (ex) {
    await client.query('ROLLBACK')
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

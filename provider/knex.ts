import * as knex from 'knex'
import { Event, Provider, StoreEvent, ErrorCallback } from '../src/types'
import { VersionError } from './error'
import { toArray } from './util'

export type Bookmark = {
  bookmark: string
  position: number
}

export type MigrateOptions = {
  client: knex
  events?: string
  bookmarks?: string
}

export type Options = {
  onError?: ErrorCallback
  bookmarks: () => knex.QueryBuilder<any, any>
  events: () => knex.QueryBuilder<any, any>
}

export function createProvider<E extends Event>(opts: Options): Provider<E> {
  const onError =
    opts.onError ||
    (() => {
      /* NOOP */
    })
  return {
    driver: 'knex',
    onError,
    getPosition: async bm => {
      const result = await opts
        .bookmarks()
        .select()
        .where('bookmark', bm)
        .first()
      if (result) return result.position
      return 0
    },
    setPosition: async (bm, pos) => {
      const updates = await opts
        .bookmarks()
        .update({ position: pos })
        .where('bookmark', bm)

      if (updates === 0) {
        await opts.bookmarks().insert({ bookmark: bm, position: pos })
      }
    },
    getEventsFor: async (stream, aggregateId, fromPosition) => {
      const query = opts
        .events()
        .select()
        .where({ stream, aggregate_id: aggregateId })
        .orderBy('version', 'asc')

      if (fromPosition !== undefined) {
        query.andWhere('position', '>', fromPosition)
      }

      const rows = await query
      return rows.map(mapToEvent)
    },
    getEventsFrom: async (stream, position) => {
      const events = await opts
        .events()
        .select()
        .whereIn('stream', toArray(stream))
        .andWhere('position', '>', position)
        .orderBy('position', 'asc')
      return events.map(mapToEvent)
    },
    append: async (stream, aggregateId, version, newEvents) => {
      try {
        const storeEvents: Array<StoreEvent<E>> = newEvents.map((event, i) => ({
          stream,
          event,
          aggregateId,
          version: version + i,
          position: 0,
          timestamp: new Date(Date.now()),
        }))

        const toInsert = storeEvents.map(storeEvent => ({
          stream: storeEvent.stream,
          aggregate_id: storeEvent.aggregateId,
          event: JSON.stringify(storeEvent.event),
          version: storeEvent.version,
          timestamp: storeEvent.timestamp,
        }))
        const results = await opts.events().insert(toInsert, ['position'])

        let index = 0
        for (const result of results) {
          storeEvents[index].position = result
          index++
        }

        return storeEvents
      } catch (ex) {
        // TODO: Verify version conflict error
        throw new VersionError(ex.message)
      }
    },
  }
}

export async function migrate(opts: MigrateOptions) {
  if (!opts.bookmarks && !opts.events) return

  await opts.client.transaction(async trx => {
    if (opts.events) {
      const eventsExists = await trx.schema.hasTable(opts.events)
      if (!eventsExists) {
        await trx.schema.createTable(opts.events, tbl => {
          tbl.bigIncrements('position').primary()
          tbl.integer('version')
          tbl.string('stream')
          tbl.string('aggregate_id')
          tbl.dateTime('timestamp')
          tbl.text('event')
        })

        await trx.schema.table(opts.events, tbl => {
          tbl.unique(['stream', 'position'])
          tbl.unique(['stream', 'aggregate_id', 'version'])
        })
      }
    }

    if (opts.bookmarks) {
      const bookmarkExists = await trx.schema.hasTable(opts.bookmarks)

      if (!bookmarkExists) {
        await trx.schema.createTable(opts.bookmarks, tbl => {
          tbl.string('bookmark').primary()
          tbl.bigInteger('position')
        })
      }
    }

    await trx.commit()
  })
}

function mapToEvent<E extends Event>(row: any): StoreEvent<E> {
  return {
    aggregateId: row.aggregate_id,
    event: JSON.parse(row.event),
    position: row.position,
    stream: row.stream,
    timestamp: row.timestamp,
    version: row.version,
  }
}

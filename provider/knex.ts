import * as knex from 'knex'
import { Event, Provider, StoreEvent } from '../src/types'
import { VersionError } from './error'

export type Bookmark = {
  bookmark: string
  position: number
}

export type MigrateOptions = {
  client: knex
  events: string
  bookmarks: string
}

export type Options<E> = {
  bookmarks: () => knex.QueryBuilder<Bookmark>
  events: <T = StoreEvent<E>[], U = never>() => knex.QueryBuilder<U, T>
}

export function createProvider<E extends Event>(opts: Options<E>): Provider<E> {
  return {
    driver: 'knex',
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
      try {
        await opts
          .bookmarks()
          .update({ position: pos })
          .where('bookmark', bm)
      } catch (ex) {
        await opts.bookmarks().insert({ bookmark: bm, position: pos })
      }
    },
    getEventsFor: async (stream, aggregateId) => {
      const rows = await opts
        .events()
        .select()
        .where({ stream, aggregateId })
        .orderBy('version', 'asc')
      return rows.map(mapToEvent)
    },
    getEventsFrom: async (stream, position) => {
      const events = await opts
        .events()
        .select()
        .where({ stream })
        .andWhere('position', '>', position)
        .orderBy('position', 'asc')
      return events.map(mapToEvent)
    },
    append: async (stream, event, aggregateId, version) => {
      try {
        await opts
          .events<never, StoreEvent<string>>()
          .insert({ stream, event: JSON.stringify(event), aggregateId, version })
      } catch (ex) {
        // TODO: Verify version conflict error
        throw new VersionError()
      }
    },
  }
}

export async function migrate(opts: MigrateOptions) {
  await opts.client.schema.createTableIfNotExists(opts.events, tbl => {})

  await opts.client.schema.createTableIfNotExists(opts.bookmarks, tbl => {})
}

function mapToEvent(row: StoreEvent<any>) {
  row.event = JSON.parse(row.event)
  return row
}

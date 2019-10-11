import { Collection, Timestamp } from 'mongodb'
import { UserEvt, StoredEvt, Provider } from '../types'

export type Bookmark = {
  bookmark: string
  position: Timestamp
}

export function createProvider<E extends UserEvt>(
  events: Collection<StoredEvt<E>>,
  bookmarks: Collection<Bookmark>
): Provider<E> {
  return {
    getPosition: bm => getPos(bm, bookmarks),
    setPosition: (bm, pos) => setPos(bm, pos, bookmarks),
    getEventsFor: async (stream, id) =>
      events
        .find({ stream, 'event.aggregateId': id })
        .sort({ position: 1 })
        .toArray(),
    getEventsFrom: async (stream, position) =>
      events
        .find({ stream, position: { $gte: position } })
        .sort({ position: 1 })
        .toArray(),
    append: async (stream, event, version) => {
      const existing = await events.findOne({
        stream,
        version,
        'event.aggregateId': event.aggregateId,
      })
      if (existing) throw new Error('Version conflict error')
      const timestamp = new Date(Date.now())
      const position = new Timestamp(0, 0)

      await events.insertOne({ stream, position, version, timestamp, event })
    },
  }
}

async function getPos(bm: string, coll: Collection<Bookmark>) {
  return coll.findOne({ bookmark: bm })
}

async function setPos(bm: string, pos: Timestamp, coll: Collection<Bookmark>) {
  await coll.updateOne(
    { bookmark: bm },
    { $set: { position: pos } },
    { upsert: true }
  )
}

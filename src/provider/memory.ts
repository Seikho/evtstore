import { UserEvt, Provider, StoredEvt, ID } from '../types'

export function createProvider<E extends UserEvt>(): Provider<E> {
  const events: Array<StoredEvt<E>> = []
  const bms = new Map<string, number>()

  const getPosition = async (bm: string) => bms.get(bm) || 0

  const setPosition = async (bm: string, pos: number) => {
    bms.set(bm, pos)
  }

  const getEventsFrom = async (stream: string, pos: number) =>
    events.filter(ev => ev.stream === stream && ev.position >= pos)

  const getEventsFor = async (stream: string, id: string) =>
    events.filter(ev => ev.stream === stream && ev.event.aggregateId === id)

  const append = async (stream: string, event: E & ID, version: number) => {
    const aggEvents = await getEventsFor(stream, event.aggregateId)
    for (const ev of aggEvents) {
      if (ev.version === version) throw new Error('Version conflict error')
    }

    events.push({
      stream,
      event,
      version,
      position: events.length,
      timestamp: new Date(Date.now()),
    })
  }

  return {
    getPosition,
    setPosition,
    getEventsFor,
    getEventsFrom,
    append,
  }
}

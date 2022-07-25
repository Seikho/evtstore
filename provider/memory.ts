import { Event, Provider, StoreEvent, ErrorCallback } from '../src/types'
import { VersionError } from './error'
import { toArray } from './util'

export function createProvider<E extends Event>(
  initEvents?: Array<StoreEvent<E>>,
  onError: ErrorCallback = () => {}
): Provider<E> {
  const events: Array<StoreEvent<E>> = initEvents || []
  const bms = new Map<string, number>()
  let position = 0

  const getPosition = async (bm: string) => bms.get(bm) || 0

  const setPosition = async (bm: string, pos: number) => {
    bms.set(bm, pos)
  }

  const getEventsFrom = async (stream: string | string[], pos: number, limit: number) => {
    const results = events.filter((ev) => toArray(stream).includes(ev.stream) && ev.position > pos)
    return limit ? results.slice(0, limit) : results
  }

  const getLastEventFor = async (stream: string | string[], id?: string) => {
    const streams = toArray(stream)

    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i]
      if (id && streams.includes(evt.stream) && evt.aggregateId === id) return evt
      if (streams.includes(evt.stream)) return evt
    }
  }

  const getEventsFor = async (stream: string, id: string, fromPosition?: number) => {
    const filter =
      fromPosition === undefined
        ? (ev: StoreEvent<E>) => ev.stream === stream && ev.aggregateId === id
        : (ev: StoreEvent<E>) =>
            ev.stream === stream && ev.aggregateId === id && ev.position > fromPosition

    return events.filter(filter)
  }

  const append = async (stream: string, aggregateId: string, version: number, newEvents: E[]) => {
    const aggEvents = await getEventsFor(stream, aggregateId)
    for (const ev of aggEvents) {
      if (ev.version === version) throw new VersionError()
    }

    const storeEvents: Array<StoreEvent<E>> = newEvents.map((event, i) => ({
      stream,
      event,
      version: version + i,
      position: ++position,
      aggregateId,
      timestamp: new Date(Date.now()),
    }))

    events.push(...storeEvents)
    return storeEvents
  }

  return {
    driver: 'memory',
    onError,
    getPosition,
    setPosition,
    getEventsFor,
    getEventsFrom,
    getLastEventFor,
    append,
  }
}

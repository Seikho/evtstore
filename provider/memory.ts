import { Event, Provider, StoreEvent } from '../src/types'
import { VersionError } from './error'

export function createProvider<E extends Event>(initEvents?: Array<StoreEvent<E>>): Provider<E> {
  const events: Array<StoreEvent<E>> = initEvents || []
  const bms = new Map<string, number>()
  let position = 0

  const getPosition = async (bm: string) => bms.get(bm) || 0

  const setPosition = async (bm: string, pos: number) => {
    bms.set(bm, pos)
  }

  const getEventsFrom = async (stream: string, pos: number) => {
    return events.filter(ev => ev.stream === stream && ev.position > pos)
  }

  const getEventsFor = async (stream: string, id: string) => {
    return events.filter(ev => ev.stream === stream && ev.aggregateId === id)
  }

  const append = async (stream: string, event: E, aggregateId: string, version: number) => {
    const aggEvents = await getEventsFor(stream, aggregateId)
    for (const ev of aggEvents) {
      if (ev.version === version) throw new VersionError()
    }

    const storeEvent: StoreEvent<E> = {
      stream,
      event,
      version,
      position: ++position,
      aggregateId,
      timestamp: new Date(Date.now()),
    }
    events.push(storeEvent)
    return storeEvent
  }

  return {
    driver: 'memory',
    getPosition,
    setPosition,
    getEventsFor,
    getEventsFrom,
    append,
  }
}

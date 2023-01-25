import { Event, Provider } from '../src/types'

export function toArray(stream: string | string[]) {
  if (Array.isArray(stream)) return stream
  return [stream]
}

export function isPositionZero(position: any) {
  if (typeof position === 'number') return position === 0
  return position.high === 1 && position.low === 0
}

export function createEventsMapper<E extends Event>(position: any) {
  const mapper: Provider<E>['createEvents'] = (stream, aggregateId, version, newEvents) => {
    const storeEvents = newEvents.map((event, i) => ({
      stream,
      position,
      version: version + i,
      timestamp: new Date(Date.now()),
      event,
      aggregateId,
    }))

    return storeEvents
  }

  return mapper
}

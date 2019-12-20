import { EventMeta, StoreEvent } from './types'

export function toMeta(ev: StoreEvent<any>): EventMeta {
  return {
    aggregateId: ev.aggregateId,
    position: ev.position,
    stream: ev.stream,
    timestamp: new Date(ev.timestamp),
    version: ev.version,
  }
}

import { EventMeta, StoreEvent } from './types'

export function toMeta(ev: StoreEvent<any>): EventMeta {
  return {
    aggregateId: ev.aggregateId,
    position: ev.position,
    stream: ev.stream,
    timestamp: ev.timestamp,
    version: ev.version,
  }
}

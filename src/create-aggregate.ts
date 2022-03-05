import { toMeta, getAllEventsFor } from './common'
import {
  Event,
  Aggregate,
  BaseAggregate,
  StoreEvent,
  StorableAggregate,
  Fold,
  ProvidedAggregate,
  Provider,
} from './types'

export function createAggregate<E extends Event, A extends Aggregate, S extends string>(
  stream: S,
  create: () => A,
  fold: Fold<E, A>
): StorableAggregate<E, A, S> {
  return { stream, aggregate: create, fold }
}

export function createProvidedAggregate<E extends Event, A extends Aggregate>(
  opts: StorableAggregate<E, A> & {
    provider: Provider<E> | Promise<Provider<E>>
    useCache?: boolean
  }
): ProvidedAggregate<E, A> {
  const aggregateCache = new Map<string, { aggregate: A & BaseAggregate; position: any }>()

  async function getAggregate(id: string): Promise<A & BaseAggregate> {
    const provider = await opts.provider

    const cached = opts.useCache && aggregateCache.get(id)
    if (cached) {
      const events = await getAllEventsFor<E>(provider, opts.stream, id, cached.position)
      if (!events.length) {
        return cached.aggregate
      }

      const lastEvent = events.slice(-1)[0]
      const aggregate = events.reduce(toNextAggregate, cached.aggregate)
      aggregateCache.set(id, { aggregate, position: lastEvent.position })
      return aggregate
    }

    const events = await getAllEventsFor<E>(provider, opts.stream, id)

    const next = { ...opts.aggregate(), aggregateId: id, version: 0 }
    const aggregate = events.reduce(toNextAggregate, next)
    if (events.length > 0) {
      const lastEvent = events.slice(-1)[0]
      aggregateCache.set(id, { aggregate, position: lastEvent.position })
    }
    return aggregate
  }

  function toNextAggregate(next: A & BaseAggregate, ev: StoreEvent<E>): A & BaseAggregate {
    return {
      ...next,
      ...opts.fold(ev.event, next, toMeta(ev)),
      version: ev.version,
      aggregateId: ev.aggregateId,
    }
  }

  return { stream: opts.stream, getAggregate, toNextAggregate, provider: opts.provider }
}

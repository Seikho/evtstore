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

type AggOpts<E extends Event, A extends Aggregate, S extends string> = {
  stream: S
  create: () => A
  fold: Fold<E, A>
  version?: string
  persistAggregate?: boolean
}

export function createAggregate<E extends Event, A extends Aggregate, S extends string>(
  opts: AggOpts<E, A, S>
): StorableAggregate<E, A, S> {
  return {
    stream: opts.stream,
    aggregate: opts.create,
    fold: opts.fold,
    version: opts.version,
    persistAggregate: !!opts.persistAggregate,
  }
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

  function toNextAggregate(prev: A & BaseAggregate, ev: StoreEvent<E>): A & BaseAggregate {
    return {
      ...prev,
      ...opts.fold(ev.event, prev, toMeta(ev)),
      version: ev.version,
      aggregateId: ev.aggregateId,
    }
  }

  return { stream: opts.stream, getAggregate, toNextAggregate, provider: opts.provider }
}

export function createPersistedAggregate<E extends Event, A extends Aggregate>(
  opts: StorableAggregate<E, A> & {
    provider: Provider<E> | Promise<Provider<E>>
    useCache?: boolean
  }
): ProvidedAggregate<E, A> {
  const aggregateCache = new Map<string, { aggregate: A & BaseAggregate; position: any }>()

  /**
   * We will attempt to retrieve the persisted version of the aggregate from the last event
   * The persisted aggregate is only valid if:
   * 1. The version passed to createPersistedAggregate function matches the version on the persisted version
   * 2.
   */
  async function getPersistedAggregate(id: string): Promise<A & BaseAggregate> {
    const provider = await opts.provider
    const lastEvent = await provider.getLastEventFor(opts.stream, id)
    if (!lastEvent) {
      return { ...opts.aggregate(), aggregateId: id, version: 0 }
    }

    if (!lastEvent.event.__persisted) {
      return getAggregate(id)
    }

    const lastAgg: A & BaseAggregate = lastEvent.event.__persisted

    if (lastAgg.__pv !== opts.version) {
      return getAggregate(id)
    }

    return lastAgg
  }

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

  return {
    stream: opts.stream,
    getAggregate: getPersistedAggregate,
    toNextAggregate,
    provider: opts.provider,
    version: opts.version,
    persistAggregate: !!opts.persistAggregate,
  }
}

import { createProvidedAggregate } from './create-aggregate'
import { EventHandler } from './event-handler'
import {
  AggregateStore,
  ProvidedAggregate,
  Provider,
  StorableAggregate,
  Event,
  HandlerBookmark,
  EventMeta,
} from './types'

type StoreOpts = {
  provider: Provider<any> | Promise<Provider<any>>
  useCache?: boolean
}

type StreamEvents<T extends AggregateStore> = { [K in ExtStreams<T>]: StreamAgg<T, K> }

type ExtStoreAgg<T extends StorableAggregate, U extends string> = T extends StorableAggregate<
  any,
  any,
  U
>
  ? T
  : never
type StreamAgg<T extends AggregateStore, U extends ExtStreams<T>> = ExtStoreAggEvent<
  ExtStoreAgg<T[keyof T], U>
>

type ToStoreAgg<T> = T extends StorableAggregate<infer E, infer A> ? ProvidedAggregate<E, A> : never

type Store<T extends AggregateStore> = { [key in keyof T]: ToStoreAgg<T[key]> } & {}

type ExtStoreAggEvent<T> = T extends StorableAggregate<infer E, any, any> ? E : never

type ExtStreams<T extends AggregateStore> = T[keyof T]['stream']

export function createDomain<Tree extends AggregateStore>(opts: StoreOpts, aggregates: Tree) {
  return createDomainV2(opts, aggregates)
}

export function createDomainV2<Tree extends AggregateStore>(opts: StoreOpts, aggregates: Tree) {
  type EventTree = StreamEvents<Tree>
  const _store: any = {}

  for (const [key, { stream, aggregate, fold }] of Object.entries(aggregates)) {
    _store[key] = createProvidedAggregate({
      provider: opts.provider,
      aggregate,
      fold,
      stream,
      useCache: opts.useCache,
    })
  }

  const createHandler = <S extends ExtStreams<Tree>[]>(bookmark: HandlerBookmark, streams: S) => {
    type Evt = EventTree[S[number]]
    type CB = (id: string, event: Event, meta: EventMeta) => any

    const callbacks = new Map<string, CB>()
    const handler = new EventHandler<Evt>({
      bookmark,
      provider: opts.provider,
      stream: streams,
    })

    const handlerCallback = (id: string, event: Event, meta: EventMeta) => {
      const cb = callbacks.get(`${meta.stream}-${event.type}`)
      if (!cb) return

      return cb(id, event as any, meta)
    }

    const handle = <Stream extends S[number], Type extends EventTree[Stream]['type']>(
      stream: Stream,
      event: Type,
      callback: (
        id: string,
        event: Extract<EventTree[Stream], { type: Type }>,
        meta: EventMeta
      ) => any
    ) => {
      callbacks.set(`${stream}-${event}`, callback as any)

      handler.handle(event, handlerCallback)
    }

    return {
      handle,
      name: handler.name,
      start: handler.start,
      stop: handler.stop,
      runOnce: handler.runOnce,
      run: handler.run,
      setPosition: handler.setPosition,
      getPosition: handler.getPosition,
      reset: handler.reset,
      __handller: handler,
    }
  }

  const domain = _store as Store<Tree>

  return {
    domain,
    createHandler,
  }
}

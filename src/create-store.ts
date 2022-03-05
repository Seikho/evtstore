import { CommandHandler } from '..'
import { createProvidedAggregate } from './create-aggregate'
import { EventHandler } from './event-handler'
import {
  Aggregate,
  AggregateStore,
  BaseAggregate,
  CmdBody,
  Command,
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

export function createStore<Tree extends AggregateStore>(opts: StoreOpts, aggregates: Tree) {
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
      start: handler.start,
      stop: handler.stop,
      runOnce: handler.runOnce,
      run: handler.run,
      setPosition: handler.setPosition,
      getPosition: handler.getPosition,
      reset: handler.reset,
    }
  }

  const store = _store as Store<Tree>

  return {
    store,
    createHandler,
  }
}

export function createCommands<E extends Event, A extends Aggregate, C extends Command>(
  provided: ProvidedAggregate<E, A>,
  handler: CommandHandler<E, A, C>
) {
  const commands = Object.keys(handler) as Array<C['type']>
  const wrapped: CmdBody<C, A & BaseAggregate> = {} as any

  for (const command of commands) {
    wrapped[command] = async (id, body) => {
      const agg = await provided.getAggregate(id)

      const cmdResult = await handler[command]({ ...body, aggregateId: id, type: command }, agg)
      const nextAggregate = await handleCommandResult(cmdResult, agg)
      return nextAggregate
    }
  }

  async function handleCommandResult(cmdResult: E | E[] | void, aggregate: A & BaseAggregate) {
    const id = aggregate.aggregateId
    let nextAggregate = { ...aggregate }

    if (cmdResult) {
      const events = Array.isArray(cmdResult) ? cmdResult : [cmdResult]
      const provider = await provided.provider
      let nextVersion = aggregate.version + 1

      const storeEvents = await provider.append(provided.stream, id, nextVersion, events)
      const nextAggregate = storeEvents.reduce(provided.toNextAggregate, aggregate)
      return nextAggregate
    }

    return nextAggregate
  }

  return wrapped
}

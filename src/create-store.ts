import { CommandHandler } from '..'
import { createProvidedAggregate } from './create-aggregate'
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
} from './types'

type StoreOpts = {
  provider: Provider<any> | Promise<Provider<any>>
  useCache?: boolean
}

// type ExtStoreAgg<T> = T extends StorableAggregate<any, infer A> ? A : never
// type ExtStoreEvt<T> = T extends StorableAggregate<infer E, any> ? E : never

// type StoreAggregate<E extends Event, A extends Aggregate> = {
//   getAggregate: (id: string) => Promise<A & BaseAggregate>
//   toNextAggregate: (prev: A & BaseAggregate, event: StoreEvent<E>) => A & BaseAggregate
// }

type ToStoreAgg<T> = T extends StorableAggregate<infer E, infer A> ? ProvidedAggregate<E, A> : never

type Store<T extends AggregateStore> = { [key in keyof T]: ToStoreAgg<T[key]['aggregate']> }

export function createStore<T extends AggregateStore>(opts: StoreOpts, aggregates: T): Store<T> {
  const store: any = {}

  for (const [
    key,
    {
      aggregate: { aggregate, fold },
      stream,
    },
  ] of Object.entries(aggregates)) {
    store[key] = createProvidedAggregate({
      provider: opts.provider,
      aggregate,
      fold,
      stream,
      useCache: opts.useCache,
    })
  }

  return store as Store<T>
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

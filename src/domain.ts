import {
  Event,
  Aggregate,
  Fold,
  Provider,
  Domain,
  Command,
  CmdBody,
  CommandHandler,
  StoreEvent,
  BaseAggregate,
} from './types'
import { EventHandler } from './handler'
import { toMeta } from './common'

type DomainOptions<E extends Event, A extends Aggregate> = {
  aggregate: () => A
  stream: string
  fold: Fold<E, A>
  provider: Provider<E> | Promise<Provider<E>>
}

export function createDomain<Evt extends Event, Agg extends Aggregate, Cmd extends Command>(
  opts: DomainOptions<Evt, Agg>,
  cmd: CommandHandler<Evt, Agg, Cmd>
): Domain<Evt, Agg, Cmd> {
  function handler(bookmark: string) {
    return new EventHandler({
      bookmark,
      provider: opts.provider,
      stream: opts.stream,
    })
  }

  return {
    handler,
    ...wrapCmd(opts, cmd),
  }
}

function wrapCmd<E extends Event, A extends Aggregate, C extends Command>(
  opts: DomainOptions<E, A>,
  cmd: CommandHandler<E, A, C>
) {
  const keys = Object.keys(cmd) as Array<C['type']>
  const command: CmdBody<C, A & BaseAggregate> = {} as any
  const providerAsync = Promise.resolve(opts.provider)

  async function getAggregate(id: string) {
    const provider = await providerAsync
    const events = await provider.getEventsFor(opts.stream, id)
    const next = { ...opts.aggregate(), aggregateId: id, version: 0 }
    const agg = events.reduce(reduceToAggregate, next)
    return agg
  }

  for (const type of keys) {
    command[type] = async (id, body) => {
      const agg = await getAggregate(id)

      const cmdResult = await cmd[type]({ ...body, aggregateId: id }, agg)
      let nextAggregate = { ...agg }

      if (cmdResult) {
        const events = Array.isArray(cmdResult) ? cmdResult : [cmdResult]
        const provider = await providerAsync
        let nextVersion = agg.version

        for (const event of events) {
          nextVersion++
          const storeEvent = await provider.append(opts.stream, event, id, nextVersion)
          nextAggregate = reduceToAggregate(nextAggregate, storeEvent)
        }
      }

      return nextAggregate
    }
  }

  function reduceToAggregate(next: A, ev: StoreEvent<E>): A & BaseAggregate {
    return {
      ...next,
      ...opts.fold(ev.event, next, toMeta(ev)),
      version: ev.version,
      aggregateId: ev.aggregateId,
    }
  }

  return { command, getAggregate }
}

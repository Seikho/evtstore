import { Event, Aggregate, Fold, Provider, Domain, Command, CmdBody, CommandHandler } from './types'
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
  const command: CmdBody<C> = {} as any
  const providerAsync = Promise.resolve(opts.provider)

  async function getAggregate(id: string) {
    const provider = await providerAsync
    const events = await provider.getEventsFor(opts.stream, id)
    const next = { ...opts.aggregate(), aggregateId: id, version: 0 }
    const agg = events.reduce((next, ev) => {
      return { ...next, ...opts.fold(ev.event, next, toMeta(ev)), version: ev.version }
    }, next)
    return agg
  }

  for (const type of keys) {
    command[type] = async (id, body) => {
      const agg = await getAggregate(id)
      const result = await cmd[type]({ ...body, aggregateId: id }, agg)

      if (result) {
        const provider = await providerAsync
        await provider.append(opts.stream, result, id, agg.version + 1)
      }
    }
  }

  return { command, getAggregate }
}

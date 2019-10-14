import { UserEvt, UserAgg, Fold, Provider, Domain, Command, UserCmd, CmdBody } from './types'
import { Handler } from './handler'

type DomainOptions<E extends UserEvt, A extends UserAgg> = {
  aggregate: () => A
  stream: string
  fold: Fold<E, A>
  provider: Provider<E>
}

export function createDomain<Evt extends UserEvt, Agg extends UserAgg, Cmd extends UserCmd>(
  opts: DomainOptions<Evt, Agg>,
  cmd: Command<Evt, Agg, Cmd>
): Domain<Evt, Agg, Cmd> {
  function handler(bookmark: string) {
    return new Handler({
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

function wrapCmd<E extends UserEvt, A extends UserAgg, C extends UserCmd>(
  opts: DomainOptions<E, A>,
  cmd: Command<E, A, C>
) {
  const keys = Object.keys(cmd) as Array<C['type']>
  const command: CmdBody<C> = {} as any

  async function getAggregate(id: string) {
    const events = await opts.provider.getEventsFor(opts.stream, id)
    const next = { ...opts.aggregate(), aggregateId: id, version: 0 }
    const agg = events.reduce((next, ev) => {
      return { ...next, ...opts.fold(ev.event, next), version: ev.version }
    }, next)
    return agg
  }

  for (const type of keys) {
    command[type] = async (id, body) => {
      const agg = await getAggregate(id)
      const result = await cmd[type]({ ...body, aggregateId: id }, agg)

      if (result) {
        await opts.provider.append(opts.stream, result, id, agg.version + 1)
      }
    }
  }

  return { command, getAggregate }
}

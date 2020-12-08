import {
  Event,
  Aggregate,
  Provider,
  Domain,
  Command,
  CmdBody,
  CommandHandler,
  StoreEvent,
  BaseAggregate,
  ExecutableAggregate,
  DomainOptions,
} from './types'
import { EventHandler } from './event-handler'
import { toMeta } from './common'

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

  if ('aggregate' in cmd) {
    throw new Error(`Invalid command body: Command handler function cannot be named "aggregate"`)
  }

  const aggregateCache = new Map<
    string,
    { aggregate: A & { aggregateId: string; version: number }; position: any }
  >()

  async function getAggregate(id: string) {
    const provider = await providerAsync

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

  async function getExecAggregate(id: string) {
    const aggregate = await getAggregate(id)
    const body: ExecutableAggregate<C, A> = {} as any

    for (const type of keys) {
      body[type] = async (cmdBody) => {
        const cmdResult = await cmd[type]({ ...cmdBody, aggregateId: id, type }, aggregate)
        const nextAggregate = await handleCommandResult(cmdResult, aggregate)

        return { ...body, aggregate: nextAggregate }
      }
    }

    return { ...body, aggregate }
  }

  // Prepare the command handlers that accept an aggregateId and a command body
  for (const type of keys) {
    command[type] = async (id, body) => {
      const agg = await getAggregate(id)

      const cmdResult = await cmd[type]({ ...body, aggregateId: id, type }, agg)
      const nextAggregate = await handleCommandResult(cmdResult, agg)
      return nextAggregate
    }
  }

  async function handleCommandResult(cmdResult: E | E[] | void, aggregate: A & BaseAggregate) {
    const id = aggregate.aggregateId
    let nextAggregate = { ...aggregate }

    if (cmdResult) {
      const events = Array.isArray(cmdResult) ? cmdResult : [cmdResult]
      const provider = await providerAsync
      let nextVersion = aggregate.version + 1

      const storeEvents = await provider.append(opts.stream, id, nextVersion, events)
      const nextAggregate = storeEvents.reduce(toNextAggregate, aggregate)
      return nextAggregate
    }

    return nextAggregate
  }

  function toNextAggregate(next: A & BaseAggregate, ev: StoreEvent<E>): A & BaseAggregate {
    return {
      ...next,
      ...opts.fold(ev.event, next, toMeta(ev)),
      version: ev.version,
      aggregateId: ev.aggregateId,
    }
  }

  return { command, getAggregate: getExecAggregate }
}

async function getAllEventsFor<E extends Event>(
  provider: Provider<any>,
  stream: string,
  id: string,
  from?: any
) {
  const events: StoreEvent<E>[] = []
  let current = from
  do {
    const stored = await provider.getEventsFor(stream, id, current)
    events.push(...stored)
    if (stored.length === 0) return events
    if (!provider.limit) return events
    if (stored.length < provider.limit) return events

    const last = stored.slice(-1)[0]
    current = last.position
  } while (true)
}

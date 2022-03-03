import {
  Event,
  Aggregate,
  Domain,
  Command,
  CmdBody,
  CommandHandler,
  BaseAggregate,
  ExecutableAggregate,
  DomainOptions,
} from './types'
import { EventHandler } from './event-handler'
import { createProvidedAggregate } from './create-aggregate'

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
  handler: CommandHandler<E, A, C>
) {
  const commands = Object.keys(handler) as Array<C['type']>
  const wrapped: CmdBody<C, A & BaseAggregate> = {} as any
  const providerAsync = Promise.resolve(opts.provider)

  if ('aggregate' in handler) {
    throw new Error(`Invalid command body: Command handler function cannot be named "aggregate"`)
  }

  const { getAggregate, toNextAggregate } = createProvidedAggregate<E, A>(opts)

  async function getExecAggregate(id: string) {
    const aggregate = await getAggregate(id)
    const body: ExecutableAggregate<C, A> = {} as any

    for (const command of commands) {
      body[command] = async (cmdBody) => {
        const cmdResult = await handler[command](
          { ...cmdBody, aggregateId: id, type: command },
          aggregate
        )
        const nextAggregate = await handleCommandResult(cmdResult, aggregate)

        return { ...body, aggregate: nextAggregate }
      }
    }

    return { ...body, aggregate }
  }

  // Prepare the command handlers that accept an aggregateId and a command body
  for (const type of commands) {
    wrapped[type] = async (id, body) => {
      const agg = await getAggregate(id)

      const cmdResult = await handler[type]({ ...body, aggregateId: id, type }, agg)
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

  return { command: wrapped, getAggregate: getExecAggregate }
}

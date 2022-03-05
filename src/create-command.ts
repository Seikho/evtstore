import {
  Aggregate,
  BaseAggregate,
  CmdBody,
  Command,
  CommandHandler,
  ProvidedAggregate,
  Event,
} from './types'

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

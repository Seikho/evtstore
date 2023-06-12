import { Knex } from 'knex'
import {
  Aggregate,
  BaseAggregate,
  CmdBody,
  Command,
  CommandHandler,
  ProvidedAggregate,
  Event,
  StoreEvent,
} from './types'

export function createCommands<E extends Event, A extends Aggregate, C extends Command>(
  provided: ProvidedAggregate<E, A>,
  handler: CommandHandler<E, A, C>,
  trx?: Knex.Transaction
) {
  const commands = Object.keys(handler) as Array<C['type']>
  const wrapped: CmdBody<C, A & BaseAggregate> = {} as any

  for (const command of commands) {
    wrapped[command] = async (id, body) => {
      const agg = await provided.getAggregate(id)

      const cmdResult = await handler[command]({ ...body, aggregateId: id, type: command }, agg)
      const nextAggregate = await handleCommandResult(cmdResult, agg, trx)
      return nextAggregate
    }
  }

  async function handleCommandResult(cmdResult: E | E[] | void, aggregate: A & BaseAggregate, trx?: Knex.Transaction) {
    const id = aggregate.aggregateId
    let nextAggregate = { ...aggregate }

    if (cmdResult) {
      const events = Array.isArray(cmdResult) ? cmdResult : [cmdResult]
      const provider = await provided.provider
      let nextVersion = aggregate.version + 1

      const newEvents = patchEvents<E, A>(
        provided,
        provider.createEvents(provided.stream, id, nextVersion, events),
        aggregate
      )
      const nextAggregate = newEvents.reduce(provided.toNextAggregate, aggregate)

      await provider.append(provided.stream, id, nextVersion, newEvents, trx)
      return nextAggregate
    }

    return nextAggregate
  }

  return wrapped
}

function patchEvents<E extends Event, A extends Aggregate>(
  provided: ProvidedAggregate<E, A, any>,
  events: StoreEvent<E>[],
  prev: A & BaseAggregate
): StoreEvent<E>[] {
  if (!provided.persistAggregate || !provided.version) {
    return events
  }
  let curr: A & BaseAggregate = prev

  const nextEvents: StoreEvent<E>[] = []
  for (const event of events) {
    curr = provided.toNextAggregate(curr, event)
    nextEvents.push({
      ...event,
      event: { ...event.event, __persisted: { __pv: provided.version, ...curr } },
    })
  }
  return nextEvents
}

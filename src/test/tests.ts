import { CmdBody, Handler, Provider } from '../types'
import { ExampleEv, ExampleAgg, ExampleCmd, exampleFold, exampleCmd } from './example'
import { BaseAggregate } from '../types'
import { createDomain } from '../domain'

type Model = {
  one: number
  seen: number
}

interface Test {
  will: string
  input: Array<(cmd: CmdBody<ExampleCmd>, hnd: Handler<ExampleEv>) => Promise<void>>
  agg?: Partial<ExampleAgg & BaseAggregate> & { id: string }
  model?: Partial<Model> & { id: string }
}

export const tests: Test[] = [
  {
    will: 'append an event',
    input: [cmd => cmd.doOne('one', { one: 42 })],
    agg: { id: 'one', one: 42, version: 1 },
  },
  {
    will: 'append another event',
    input: [cmd => cmd.doOne('one', { one: 84 })],
    agg: { id: 'one', one: 84, version: 2 },
  },
  {
    will: 'correctly update model using event handler',
    input: [],
    model: {
      id: 'one',
      seen: 2,
      one: 42 + 84,
    },
  },
]

type TestDomain = {
  command: CmdBody<ExampleCmd>
  getAggregate: (id: string) => Promise<ExampleAgg & BaseAggregate>
  models: Map<string, Model>
  populator: Handler<ExampleEv>
}

const domains = new Map<string, TestDomain>()

export function registerTestDomain(name: string, provider: Provider<ExampleEv>) {
  const { command, getAggregate, handler } = createDomain(
    {
      provider,
      aggregate: () => ({ one: 0, two: '', three: [] }),
      fold: exampleFold,
      stream: 'example',
    },
    exampleCmd
  )

  const models = new Map<string, Model>()

  const populator = handler(`example`)
  populator.handle('one', async (id, ev) => {
    const model = models.get(id) || { one: 0, seen: 0 }
    model.seen++
    model.one += ev.one
    models.set(id, model)
  })

  domains.set(name, { command, getAggregate, models, populator })
  return
}

export function getDomain(name: string) {
  return domains.get(name)
}

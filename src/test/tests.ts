import { CmdBody, Handler, Provider } from '../types'
import { ExampleEv, ExampleAgg, ExampleCmd, exampleFold, exampleCmd } from './example'
import { BaseAggregate } from '../types'
import { createDomain } from '../domain'
import { expect } from 'chai'

type Model = {
  one: number
  seen: number
}

type InputFn = (
  cmd: CmdBody<ExampleCmd, ExampleAgg>,
  hnd: Handler<ExampleEv>,
  prv: Provider<ExampleEv>
) => Promise<ExampleAgg | void>

interface Test {
  will: string
  input: InputFn[]
  agg?: Partial<ExampleAgg & BaseAggregate> & { id: string }
  model?: Partial<Model> & { id: string }
  assert?: InputFn
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
  {
    will: 'append event to new aggregate',
    input: [cmd => cmd.doOne('two', { one: 100 })],
    agg: { id: 'two', one: 100, version: 1 },
  },
  {
    will: 'not affect original aggregate/model',
    input: [],
    agg: { id: 'one', one: 84, version: 2 },
    model: { id: 'one', one: 42 + 84, seen: 2 },
  },
  {
    will: 'fetch a bookmark without pre-existing',
    input: [],
    assert: async (_, __, prv) => {
      const bm = await prv.getPosition('undefined')
      expect(bm).to.exist
    },
  },
  {
    will: 'throw on version conflict',
    input: [],
    assert: async (_, __, prv) => {
      let threw = false
      await prv.append(prv.driver, { example: 42 } as any, 'conflict-id', 1)
      try {
        await prv.append(prv.driver, { example: 42 } as any, 'conflict-id', 1)
        threw = false
      } catch (ex) {
        threw = true
      }
      expect(threw, 'throws on version conflict').to.equal(true)
    },
  },
]

type TestDomain = {
  command: CmdBody<ExampleCmd, ExampleAgg>
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
      stream: `${name}-example`,
    },
    exampleCmd
  )

  const models = new Map<string, Model>()

  const populator = handler(`${name}-example`)
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

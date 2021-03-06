import { Handler, Provider, Domain } from '../types'
import { ExampleEv, ExampleAgg, ExampleCmd, exampleFold, exampleCmd } from './example'
import { BaseAggregate } from '../types'
import { createDomain } from '../domain'
import { expect } from 'chai'
import { MemoryBookmark } from '../common'
import { createHandler } from '../create-handler'

type Model = {
  one: number
  seen: number
}

type InputFn = (
  domain: TestDomain,
  provider: Provider<ExampleEv>,
  name: string
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
    input: [({ command }) => command.doOne('one', { one: 42 })],
    agg: { id: 'one', one: 42, version: 1 },
  },
  {
    will: 'append another event',
    input: [({ command }) => command.doOne('one', { one: 84 })],
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
    input: [({ command }) => command.doOne('two', { one: 100 })],
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
    assert: async (_, prv) => {
      const bm = await prv.getPosition('undefined')
      expect(bm).to.exist
    },
  },
  {
    will: 'throw on version conflict',
    input: [],
    assert: async (_, prv) => {
      let threw = false
      await prv.append(prv.driver, 'conflict-id', 1, [{ example: 42 } as any])
      try {
        await prv.append(prv.driver, 'conflict-id', 1, [{ example: 42 } as any])
        threw = false
      } catch (ex) {
        threw = true
      }
      expect(threw, 'throws on version conflict').to.equal(true)
    },
  },
  {
    will: 'return correct aggregate from command',
    input: [],
    assert: async ({ command }) => {
      const aggregateId = 'returned-agg'

      const first = await command.doOne(aggregateId, { one: 1 })
      expect(first).to.include({ version: 1, aggregateId, one: 1 })

      const second = await command.doOne(aggregateId, { one: 2 })
      expect(second).to.include({ version: 2, aggregateId, one: 2 })
    },
  },
  {
    will: 'handle returning multiple events',
    input: [],
    assert: async ({ command }) => {
      const aggregateId = 'multi-agg'

      const first = await command.doMulti(aggregateId, { multi: 1 })
      expect(first).to.include({ version: 2, multi: 2 })

      const second = await command.doMulti(aggregateId, { multi: 2 })
      expect(second).to.include({ version: 4, multi: 6 })
    },
  },
  {
    will: 'return valid aggregate using executable aggregate',
    input: [],
    assert: async ({ getAggregate }) => {
      const first = await getAggregate('multi-agg')
      expect(first.aggregate).to.include({ version: 4, multi: 6 })

      const second = await first.doMulti({ multi: 1 })
      expect(second.aggregate).to.include({ version: 6, multi: 8 })
    },
  },
  {
    will: 'return empty aggregate',
    input: [],
    assert: async ({ getAggregate }) => {
      const actual = await getAggregate('unused-aggregate')
      expect(actual.aggregate).to.deep.include({ version: 0, one: 0, two: '', three: [], multi: 0 })
    },
  },
  {
    will: 'have non-zero version in command handler',
    input: [],
    assert: async ({ command }) => {
      await command.doOne('non-zero', { one: 1 })
      await command.doVersion('non-zero', {})
    },
  },
  {
    will: 'correctly use in-memory bookmark',
    input: [],
    assert: async ({ handler, command }) => {
      let count = 0
      const pop = handler(MemoryBookmark)
      pop.handle('one', async () => {
        ++count
      })
      await pop.runOnce()
      expect(count).to.equal(6)
      await pop.runOnce()
      expect(count).to.equal(6)
      await command.doOne('in-memory', { one: 1 })
      await pop.runOnce()
      expect(count).to.equal(7)
    },
  },
  {
    will: 'correctly handle multiple streams in a single handler',
    input: [],
    assert: async ({ command }, provider) => {
      const testId = 'two-streams'
      const { second, handler } = getSecondDomain(provider)
      let firstCount = 0
      let secondCount = 0

      handler.handle('test-example', 'one', async (id) => {
        if (id !== testId) return
        ++firstCount
      })

      handler.handleStream('test-second', {
        one: async (id) => {
          if (id !== testId) return
          ++secondCount
        },
      })

      await command.doOne(testId, { one: 1 })
      await command.doOne(testId, { one: 1 })
      await second.command.doOne(testId, { one: 1 })
      await second.command.doOne('different-id', { one: 1 })

      await handler.runOnce()
      expect(firstCount).to.equal(2)
      expect(secondCount).to.equal(1)
    },
  },
]

function getSecondDomain(prv: Provider<ExampleEv>) {
  const second = createDomain<ExampleEv, ExampleAgg, ExampleCmd>(
    {
      provider: prv,
      aggregate: () => ({ one: 0, two: '', three: [], multi: 0 }),
      fold: exampleFold,
      stream: `test-second`,
    },
    exampleCmd
  )

  type Events = {
    'test-example': ExampleEv
    'test-second': ExampleEv
  }

  const handler = createHandler<Events>({
    bookmark: 'two-handler',
    streams: [`test-example`, `test-second`],
    provider: prv,
  })

  return { second, handler }
}

type TestDomain = {
  models: Map<string, Model>
  populator: Handler<ExampleEv>
} & Domain<ExampleEv, ExampleAgg, ExampleCmd>

const domains = new Map<string, TestDomain>()

export function registerTestDomain(name: string, provider: Provider<ExampleEv>) {
  const domain = createDomain(
    {
      provider,
      aggregate: () => ({ one: 0, two: '', three: [], multi: 0 }),
      fold: exampleFold,
      stream: `test-example`,
      useCache: true,
    },
    exampleCmd
  )

  const models = new Map<string, Model>()

  const populator = domain.handler(`${name}-example`)

  populator.handle('one', async (id, ev) => {
    const model = models.get(id) || { one: 0, seen: 0 }
    model.seen++
    model.one += ev.one
    models.set(id, model)
  })

  domains.set(name, { models, populator, ...domain })
  return
}

export function getDomain(name: string) {
  return domains.get(name)
}

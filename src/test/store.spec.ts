import { expect } from 'chai'
import { createAggregate } from '../create-aggregate'
import { createCommands } from '../create-command'
import { createDomainV2 } from '../domain-v2'
import { CommandHandler, Provider } from '../types'
import { providers } from './providers'

type AggOne = { count: number }
type EvtOne = { type: 'inc'; value: number } | { type: 'dec'; value: number }

type AggTwo = { name: string }
type EvtTwo = { type: 'set'; value: string }

const one = createAggregate<EvtOne, AggOne, 'one-events'>(
  'one-events',
  () => ({ count: 0 }),
  (evt, agg) => {
    switch (evt.type) {
      case 'inc':
        return { count: agg.count + evt.value }
      case 'dec':
        return { count: agg.count - evt.value }
    }
  }
)

const cmdOne: CommandHandler<EvtOne, AggOne, EvtOne> = {
  dec: async (cmd) => {
    return { type: 'dec', value: cmd.value }
  },
  inc: async (cmd) => {
    return { type: 'inc', value: cmd.value }
  },
}

const two = createAggregate<EvtTwo, AggTwo, 'two-events'>(
  'two-events',
  () => ({ name: '' }),
  (evt) => {
    return { name: evt.value }
  }
)

const cmdTwo: CommandHandler<EvtTwo, AggTwo, EvtTwo> = {
  set: async (cmd) => {
    return { type: 'set', value: cmd.value }
  },
}

function create(prv: Promise<Provider<any>>) {
  const { domain, createHandler } = createDomainV2({ provider: prv }, { one, two })
  return {
    domain,
    createHandler,
    cmd: {
      one: createCommands(domain.one, cmdOne),
      two: createCommands(domain.two, cmdTwo),
    },
  }
}

describe(`store tests`, () => {
  for (const prv of providers) {
    const cache = create(prv.provider())
    const { domain, cmd } = cache
    const ones = new Map<string, number>()
    const twos = new Map<string, string>()
    const handler = cache.createHandler('abc', ['one-events', 'two-events'])

    describe(`::${prv.name}`, function (this: any) {
      handler.handle('one-events', 'inc', (id, ev) => {
        ones.set(id, ev.value)
      })
      handler.handle('two-events', 'set', (id, ev) => {
        twos.set(id, ev.value)
      })

      this.timeout(10000)

      it('will retrieve initial aggregates', async () => {
        const left = await domain.one.getAggregate('1')
        const right = await domain.two.getAggregate('2')
        match(left, { version: 0 })
        match(right, { version: 0 })
      })

      it('will apply a basic command', async () => {
        await cmd.one.inc('1', { value: 1 })
        await cmd.two.set('2', { value: 'two' })
        const left = await domain.one.getAggregate('1')
        const right = await domain.two.getAggregate('2')

        match(left, { version: 1, count: 1 })
        match(right, { version: 1, name: 'two' })
      })

      it('will evaluate read models', async () => {
        try {
          await handler.runOnce()
          expect(ones.get('1')).to.eq(1)
          expect(twos.get('2')).to.eq('two')
        } catch (ex) {
          console.log(ex)
          throw ex
        }
      })
    })
  }
})

function match(actual: any, expected: any) {
  for (const key in expected) {
    if (key === 'id') continue
    expect(actual[key], key).to.equal(expected[key])
  }
}

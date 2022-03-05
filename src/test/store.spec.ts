import { expect } from 'chai'
import { createAggregate } from '../create-aggregate'
import { createCommands, createStore } from '../create-store'
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
  const { store, createHandler } = createStore({ provider: prv }, { one, two })
  return {
    store,
    createHandler,
    cmd: {
      one: createCommands(store.one, cmdOne),
      two: createCommands(store.two, cmdTwo),
    },
  }
}

type StoreEx = Cache['store']
type CmdEx = Cache['cmd']

type Cache = ReturnType<typeof create>

describe.only(`store tests`, () => {
  let cache: Cache
  let store: StoreEx
  let cmd: CmdEx

  for (const prv of providers) {
    describe(`::${prv.name}`, function (this: any) {
      const ones = new Map<string, any>()
      const twos = new Map<string, any>()
      const handler = cache.createHandler('abc', ['one-events', 'two-events'])

      handler.handle('one-events', 'inc', (id, ev) => {
        ones.set(id, ev.value)
      })
      handler.handle('two-events', 'set', (id, ev) => {
        twos.set(id, ev.value)
      })

      this.timeout(10000)

      it('will retrieve initial aggregates', async () => {
        cache = create(prv.provider())

        store = cache.store
        cmd = cache.cmd
        const left = await store.one.getAggregate('1')
        const right = await store.two.getAggregate('2')
        match(left, { version: 0 })
        match(right, { version: 0 })
      })

      it('will apply a basic command', async () => {
        await cmd.one.inc('1', { value: 1 })
        await cmd.two.set('2', { value: 'two' })
        const left = await store.one.getAggregate('1')
        const right = await store.two.getAggregate('2')

        match(left, { version: 1, count: 1 })
        match(right, { version: 1, name: 'two' })
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

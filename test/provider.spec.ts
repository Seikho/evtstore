import * as util from './util'
import * as memory from '../src/provider/memory'
import { tests, registerTestDomain, getDomain } from './tests'
import { StoredEvt, Provider } from '../src/types'
import { Bookmark, migrate, createProvider } from '../src/provider/mongo'
import { ExampleEv } from './example'
import { expect } from 'chai'

const providers: { [key: string]: Promise<Provider<ExampleEv>> } = {
  memory: Promise.resolve(memory.createProvider<ExampleEv>()),
  mongo: createMongoProvider(),
}

describe('provider tests', () => {
  before(setupDomains)

  for (const name in providers) {
    describe(`::${name}`, () => {
      for (const { will, input, agg, model } of tests) {
        it(`${name}::${will}`, async () => {
          const { command, getAggregate, models, populator } = getDomain(name)!
          for (const func of input) {
            await func(command, populator)
          }

          if (agg) {
            const actual = await getAggregate(agg.id)
            match(agg, actual)
          }

          if (model) {
            await populator.runOnce()
            const actual = models.get(model.id)
            expect(actual, 'read model exists').to.exist
            match(model, actual)
          }
        })
      }
    })
  }
})

function match(actual: any, expected: any) {
  for (const key in actual) {
    if (key === 'id') continue
    expect(actual[key]).to.equal(expected[key])
  }
}

async function setupDomains() {
  for (const [name, providerAsync] of Object.entries(providers)) {
    const provider = await providerAsync
    registerTestDomain(name, provider)
  }
}

async function createMongoProvider() {
  await util.createCleanDb()
  const { db } = await util.getTestDatabase()
  const events = db.collection<StoredEvt<any>>('events')
  const bookmarks = db.collection<Bookmark>('bookmarks')
  await migrate(events, bookmarks)
  return createProvider<ExampleEv>(events, bookmarks)
}

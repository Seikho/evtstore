import * as knex from 'knex'
import * as util from './util'
import * as memory from '../../provider/memory'
import * as sql from '../../provider/knex'
import * as neo from '../../provider/neo4j'
import * as fs from 'fs'
import { tests, registerTestDomain, getDomain } from './tests'
import { StoreEvent, Provider } from '../types'
import { Bookmark, migrate, createProvider } from '../../provider/mongo'
import { ExampleEv } from './example'
import { expect } from 'chai'

type ProviderHelper = Provider<ExampleEv> | Promise<Provider<ExampleEv>>

const providers: { [key: string]: ProviderHelper } = {
  memory: Promise.resolve(memory.createProvider<ExampleEv>()),
  mongo: createMongo(),
  mongoLimit: createLimitedMongo(),
  sqliteMemory: createSqliteMemory(),
  sqliteFile: createSqliteFile(),
  postgres: createPostgres(),
  postgresLimit: createLimitPostgres(),
  neo4j: createNeo(),
  neo4jLimit: createNeoLimit(),
}

describe('provider tests', () => {
  before(setupDomains)

  for (const name in providers) {
    describe(`::${name}`, () => {
      for (const { will, input, agg, model, assert } of tests) {
        it(`${name}::${will}`, async () => {
          const domain = getDomain(name)!
          const provider = await providers[name]
          for (const func of input) {
            await func(domain, provider, name)
          }

          if (agg) {
            const actual = await domain.getAggregate(agg.id)
            match(agg, actual.aggregate)
          }

          if (model) {
            await domain.populator.runOnce()
            const actual = domain.models.get(model.id)
            expect(actual, 'read model exists').to.exist
            match(model, actual)
          }

          if (assert) {
            await assert(domain, provider, name)
          }
        })
      }
    })
  }
})

function match(actual: any, expected: any) {
  for (const key in actual) {
    if (key === 'id') continue
    expect(actual[key], key).to.equal(expected[key])
  }
}

async function setupDomains() {
  for (const [name, providerAsync] of Object.entries(providers)) {
    const provider = await providerAsync
    registerTestDomain(name, provider)
  }
}

async function createMongo() {
  const { db } = await util.getTestMongoDB('sync-mongo')
  const events = db.collection<StoreEvent<any>>('events')
  const bookmarks = db.collection<Bookmark>('bookmarks')
  await migrate(events, bookmarks)
  return createProvider<ExampleEv>({ events, bookmarks })
}

async function createLimitedMongo() {
  const { db } = await util.getTestMongoDB('sync-mongolimited')
  const events = db.collection<StoreEvent<any>>('events')
  const bookmarks = db.collection<Bookmark>('bookmarks')
  await migrate(events, bookmarks)
  return createProvider<ExampleEv>({ limit: 1, events, bookmarks })
}

async function createSqliteMemory() {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    log: {
      warn(_msg: any) {},
      deprecate(_msg: any) {},
      debug(_msg: any) {},
    },
  })

  await sql.migrate({ client: db, events: 'events', bookmarks: 'bookmarks' })

  const events = () => db<any, any>('events')
  const bookmarks = () => db<any, any>('bookmarks')

  return sql.createProvider<ExampleEv>({ events, bookmarks })
}

async function createSqliteFile() {
  try {
    fs.statSync('test.sqlite')
    fs.unlinkSync('test.sqlite')
  } catch (ex) {}

  const db = knex({
    client: 'sqlite3',
    connection: 'test.sqlite',
    useNullAsDefault: true,
    log: {
      warn(_msg: any) {},
      deprecate(_msg: any) {},
      debug(_msg: any) {},
    },
  })

  await sql.migrate({ client: db, events: 'events', bookmarks: 'bookmarks' })

  const events = () => db<any, any>('events')
  const bookmarks = () => db<any, any>('bookmarks')

  return sql.createProvider<ExampleEv>({ events, bookmarks })
}

async function createPostgres() {
  const client = await util.getTestPostgresDB('postgresasync')
  const provider = sql.createProvider<ExampleEv>({
    bookmarks: () => client<any, any>('bookmarks'),
    events: () => client<any, any>('events'),
  })

  return provider
}

async function createLimitPostgres() {
  const client = await util.getTestPostgresDB('postgresasynclimited')
  const provider = sql.createProvider<ExampleEv>({
    limit: 1,
    bookmarks: () => client<any, any>('bookmarks'),
    events: () => client<any, any>('events'),
  })

  return provider
}

async function createNeo() {
  const db = await util.createTestNeoDB('Neo')
  const provider = neo.createProvider<ExampleEv>({
    bookmarks: db.bookmarks,
    events: db.events,
    session: db.session,
  })

  return provider
}

async function createNeoLimit() {
  const db = await util.createTestNeoDB('NeoLimit')
  const provider = neo.createProvider<ExampleEv>({
    limit: 1,
    bookmarks: db.bookmarks,
    events: db.events,
    session: db.session,
  })

  return provider
}

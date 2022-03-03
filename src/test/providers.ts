import { knex } from 'knex'
import * as util from './util'
import * as memory from '../../provider/memory'
import * as sql from '../../provider/knex'
import * as neo from '../../provider/neo4j'
import * as neov3 from '../../provider/neo4j-v3'
import * as pg from '../../provider/pg'
import * as fs from 'fs'
import { StoreEvent, Provider } from '../types'
import { Bookmark, migrate, createProvider } from '../../provider/mongo'
import { ExampleEv } from './example'

export const providers: ProviderTest[] = [
  { name: 'memory', provider: () => Promise.resolve(memory.createProvider<ExampleEv>()) },
  {
    name: 'mongo',
    provider: createMongo,
  },
  {
    name: 'mongoLimit',
    provider: createLimitedMongo,
  },
  {
    name: 'sqliteMemory',
    provider: createSqliteMemory,
  },
  {
    name: 'sqliteFile',
    provider: createSqliteFile,
  },
  {
    name: 'knex-postgres',
    provider: createKnex,
  },
  {
    name: 'pg',
    provider: () => createPostgres('pg_async'),
  },
  {
    name: 'pg-limit',
    provider: () => createPostgres('pg_limit_async', 1),
  },
  {
    name: 'knex-postgres-limit',
    provider: createLimitPostgres,
  },
  {
    name: 'neo4j',
    provider: createNeo,
  },
  {
    name: 'neo4jLimit',
    provider: createNeoLimit,
  },
  {
    name: 'neo4j.v3',
    provider: createNeoV3,
  },
  {
    name: 'neo4jLimit.v3',
    provider: createNeoV3Limit,
  },
]

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

async function createPostgres(name: string, limit?: number) {
  const client = await util.getTestPostgresDb(name)
  const provider = pg.createProvider<ExampleEv>({
    client,
    events: 'events',
    bookmarks: 'bookmarks',
    limit,
  })

  return provider
}

async function createKnex() {
  const client = await util.getTestKnexDB('postgresasync')
  const provider = sql.createProvider<ExampleEv>({
    bookmarks: () => client<any, any>('bookmarks'),
    events: () => client<any, any>('events'),
  })

  return provider
}

async function createLimitPostgres() {
  const client = await util.getTestKnexDB('postgresasynclimited')
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
    client: db.client,
  })

  return provider
}

async function createNeoLimit() {
  const db = await util.createTestNeoDB('NeoLimit')
  const provider = neo.createProvider<ExampleEv>({
    limit: 1,
    bookmarks: db.bookmarks,
    events: db.events,
    client: db.client,
  })

  return provider
}

async function createNeoV3() {
  const db = await util.createTestNeoV3DB('NeoV3')
  const provider = neov3.createProvider<ExampleEv>({
    bookmarks: db.bookmarks,
    events: db.events,
    client: db.client,
  })

  return provider
}

async function createNeoV3Limit() {
  const db = await util.createTestNeoV3DB('NeoV3Limit')
  const provider = neov3.createProvider<ExampleEv>({
    bookmarks: db.bookmarks,
    events: db.events,
    client: db.client,
  })

  return provider
}

type ProviderTest = {
  name: string
  provider: () => Promise<Provider<ExampleEv>>
  cache?: Provider<ExampleEv>
}

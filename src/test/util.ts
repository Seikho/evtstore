import { knex } from 'knex'
import * as sql from '../../provider/knex'
import * as pg from '../../provider/pg'
import * as neo from 'neo4j-driver'
import { MongoClient } from 'mongodb'
import { config } from 'dotenv'
import { migrate } from '../../provider/neo4j'
import { migrate as migrateV3 } from '../../provider/neo4j-v3'
import { Client, Pool } from 'pg'

try {
  config({ path: '.env' })
  config({ path: 'test.env' })
} catch (ex) {}

const dbHost = process.env.DB_HOST || '127.0.0.1'

export async function getTestMongoDB(dbName: string) {
  const port = Number(process.env.MONGO_PORT)
  if (isNaN(port)) throw new Error('MONGO_PORT not set')

  const client = await MongoClient.connect(`mongodb://${dbHost}:${port}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  const db = client.db(dbName)

  try {
    await db.dropDatabase()
  } catch (ex) {}

  return { db, client }
}

const dbNames: Record<string, number> = {}

export async function getTestPostgresDb(dbName: string) {
  dbName = safeName(dbName)

  const port = Number(process.env.POSTGRES_PORT || '30002')
  const user = process.env.POSTGRES_USER || 'admin'
  const password = process.env.POSTGRES_PASSWORD || 'admin'
  if (!port || !user || !password) throw new Error('POSTGRES vars not set')

  const root = new Client({
    host: dbHost,
    port,
    user,
    password,
    database: 'postgres',
  })

  await root.connect()

  try {
    await root.query(`DROP DATABASE ${dbName}`)
  } catch (ex) {
    ex
  }

  await root.query(`CREATE DATABASE ${dbName} OWNER ${user}`)
  const client = new Pool({
    host: dbHost,
    port,
    user,
    password,
    database: dbName,
  })

  await pg.migrate({ client, events: 'events', bookmarks: 'bookmarks' })

  return client
}

export async function getTestKnexDB(dbName: string) {
  dbName = safeName(dbName)

  const port = Number(process.env.POSTGRES_PORT || '30002')
  const user = process.env.POSTGRES_USER || 'admin'
  const password = process.env.POSTGRES_PASSWORD || 'admin'
  if (!port || !user || !password) throw new Error('POSTGRES vars not set')

  const root = knex({
    client: 'pg',
    connection: {
      host: dbHost,
      port,
      user,
      password,
      database: 'postgres',
    },
  })

  try {
    await root.raw(`DROP DATABASE ${dbName}`)
  } catch (ex) {}

  await root.raw(`CREATE DATABASE ${dbName} OWNER ${user}`)

  const client = knex({
    client: 'pg',
    connection: {
      host: dbHost,
      port,
      user,
      password,
      database: dbName,
    },
  })

  await sql.migrate({
    client,
    events: 'events',
    bookmarks: 'bookmarks',
  })

  return client
}

export async function createTestNeoDB(dbName: string) {
  const events = `${dbName}Events`
  const bookmarks = `${dbName}Bookmarks`

  const port = process.env.NEO_PORT
  const client = neo.driver(`bolt://localhost:${port}`, neo.auth.basic('neo4j', 'admin'))
  const session = client.session({ defaultAccessMode: neo.session.WRITE })

  await session.run(`MATCH (n: ${events}) DETACH DELETE n`)
  await session.run(`MATCH (n: ${bookmarks}) DETACH DELETE n`)

  await migrate({ client, events, bookmarks })

  return { client, events, bookmarks }
}

export async function createTestNeoV3DB(dbName: string) {
  const events = `${dbName}Events`
  const bookmarks = `${dbName}Bookmarks`

  const port = process.env.NEOV3_PORT
  const client = neo.driver(`bolt://localhost:${port}`, neo.auth.basic('neo4j', 'admin'))
  const session = client.session({ defaultAccessMode: neo.session.WRITE })

  await session.run(`MATCH (n: ${events}) DETACH DELETE n`)
  await session.run(`MATCH (n: ${bookmarks}) DETACH DELETE n`)

  await migrateV3({ client, events, bookmarks })

  return { client, events, bookmarks }
}

function safeName(name: string) {
  if (!dbNames[name]) dbNames[name] = 0
  dbNames[name]++
  return `${name}_${dbNames[name]}`
}

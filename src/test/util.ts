import * as knex from 'knex'
import * as sql from '../../provider/knex'
import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

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

export async function getTestPostgresDB(dbName: string) {
  const port = Number(process.env.POSTGRES_PORT)
  const user = process.env.POSTGRES_USER
  const password = process.env.POSTGRES_PASSWORD
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

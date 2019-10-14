import { Db, MongoClient } from 'mongodb'
import { config } from 'dotenv'

config({ path: 'test.env' })

export async function createCleanDb(): Promise<void> {
  await getTestDatabase()
  await dropTestDatabase()
}

let hasBeenDropped = false

let cachedDatabase: Db
let cacheClient: MongoClient

async function dropTestDatabase() {
  if (!hasBeenDropped) {
    hasBeenDropped = true
    await cachedDatabase.dropDatabase()
  }

  const collections = await cachedDatabase.collections()
  const names = collections.map(coll => coll.collectionName)
  const emptyQueries = names.map(name => clearCollection(cachedDatabase, name))
  await Promise.all(emptyQueries)
}

export async function getTestDatabase() {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI not set')

  if (cachedDatabase) {
    return {
      db: cachedDatabase!,
      client: cacheClient!,
    }
  }

  const client = await MongoClient.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })

  const db = client.db()

  cacheClient = client
  cachedDatabase = db
  return { db, client }
}

export async function clearCollection(db: Db, collectionName: string) {
  const collection = db.collection(collectionName)

  const isCapped = await collection.isCapped()
  if (isCapped) {
    const options = await collection.options()
    await collection.drop()

    return db.createCollection(collectionName, {
      capped: true,
      size: options.size,
      max: options.max,
    })
  }

  return collection.deleteMany({})
}

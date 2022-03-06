## Supported Database Providers

### Databases

- Postgres using [node-postgres](https://node-postgres.com)
- SQLite, MySQL, Postgres using [Knex](https://knexjs.org)
- In-memory
- MongoDB
- Neo4j v3.5
- Neo4j v4

### Create Your Own

You can create your own providers. See the [existing providers](https://github.com/Seikho/evtstore/tree/master/provider) for examples.

### Postgres with node-postgres

```ts
import { createProvider, migrate } from 'evtstore/provider/pg'
import { Pool } from 'pg'

const client = new Pool({ ... })

export const provider = createProvider({
  limit: 1000, // The maximum number of events that can be returned at a time
  events: 'events',
  bookmarks: 'bookmarks'
})

export async function setupEventStore() {
  await migrate({ client, events: 'events', bookmarks: 'bookmarks' })
}

```

### SQL with Knex.js

```ts
import { createProvider, migrate } from 'evtstore/provider/knex'

const provider = createProvider({
  limit: 1000, // The maximum number of events that can be returned at a time
  events: () => dbClient.table('events'),
  bookmarks: () => dbClient.table('bookmarks'),
})

export async function setupEventStore() {
  await migrate({ client: dbClient, events: 'events', bookmarks: 'bookmarks' })
}
```

- SQL provider for SQLite and Postgres
- The `knex` and `sqlite3 or pg` dependencies must be installed prior to use
- Bookmark table: `{ bookmark: string, position: number }`
- Events table: `{ stream: string, version: number, position: number, timestamp: DateTime, event: text }`
- A `migrate` function is provided

### MongoDB

```ts
import { createProvider, migrate } from 'evtstore/provider/mongo'
const client = MongoClient.connect('mongodb://...')

const events = client.then((db) => db.collection('events'))
const bookmarks = client.then((db) => db.collection('bookmarks'))

const provider = createProvider({
  limit: 1000, // Maximum number of events to return in a single query

  // The events and bookmarks collections can be promises of collections or just collections
  events,
  bookmarks,
})

export async function setupEventStore() {
  // The events and bookmarks collections can be promises of collections or just collections
  await migrate(events, bookmarks)
}
```

- A MongoDB provider
- The `mongodb` dependency is not included and must be installed prior to using it.
- Two collections are expected to passed to the provider with read/write:
  - `StoredEvent`: `{ stream: string, position: Timestamp, event: object, timestamp: Date, version: number }`
  - `Bookmark`: `{ bookmark: string, position: Timestamp }`
- A command that returns an event will `append` an event to the `StoredEvent` collection
- An event handler will create and maintain a `Bookmark`
- A `migrate` function is provided

### In-memory

`import { createProvider } from 'evtstore/provider/memory'`

- In memory provider for experimentation.
- This can be initalised with an array of `StoredEvent[]`

### Neo4j v3.5 and v4

Neo4j providers use the [neo4j-driver package](https://www.npmjs.com/package/neo4j-driver).

Neo4j 3.5 does not support unique constraints across multiple properties.  
To circumvent this we create properties with the concatenated values that we need to index.

```ts
import * as neo from 'neo4j-driver'

// Either one of these
import { createProvider, migrate } from 'evtstore/provider/neo4j-v3'
import { createProvider, migrate } from 'evtstore/provider/neo4j'

const client = neo.driver(`bolt://localhost:7687`, neo.auth.basic('neo4j', 'admin'))

const events = 'Events'
const bookmarks = 'Bookmarks'

const provider = createProvider({ client, events, bookmarks })

async function setupEventStore() {
  await migrate({ client, events, bookmarks })
}
```

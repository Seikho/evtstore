# EvtStore

> Type safe CQRS and Event Sourcing for Node.js with TypeScript

## Why

I reguarly use event sourcing and wanted to lower the barrier for entry and increase productivity for colleagues.  
The design goals were:

- Provide as much type safety and inference as possible
- Make creating domains quick and intuitive
- Be easy to test
- Allow developers to focus on application/business problems instead of Event Sourcing and CQRS problems

To obtain these goals the design is highly opinionated, but still flexible.

## Features

- Pre-written providers for SQL (using Knex), MongoDB, Neo4j, and In-memory (for experimentation)
- Type safety and inference when implementing and calling domains, handlers, and commands
- Infrequent/unobtrusive use of generics
- Consume one or multiple event streams in process managers and read model populators

## Installation

```sh
> yarn add evtstore
# Or
> npm i evtstore
```

`evtstore` is typed with TypeScript and comes with multiple storage "providers":

**See `src/test/util.ts` and `provider.spec.ts` for examples**

## Database Providers

### Custom Providers

You can create your own providers. See the existing providers for examples.

### In-memory

`import { createProvider } from 'evtstore/provider/memory'`

- In memory provider for experimentation.
- This can be initalised with an array of `StoredEvent[]`

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

## Examples

Some examples are available in the `src/test/provider.spec.ts` module

## Sample

```ts
import { createDomain } from 'evtstore'
import { createProvider } from 'evtstore/provider/memory'

type UserEvent = { type: 'UserCreated' } | { type: 'NameChanged'; name: string }

type UserCommand = { type: 'createUser' } | { type: 'changeName'; name: string }

type UserAggregate = { name: string }

/**
 * Domains:
 * - return the "command" object for invoking commands
 * - return a "handler" function for creating event handlers
 * -- i.e., for creating process managers and read model populators
 */
export const userDomain = createDomain<UserEvent, UserAggregate, UserCommand>(
  {
    stream: 'users',
    // Aggregate function return a new and empty aggregate
    aggregate: () => ({ name: '' }),

    /**
     * Providers:
     * - append and retrieving events (by aggregate id and from a position)
     * - retrieve and update bookmarks
     */
    provider: createProvider({
      onError: (err, stream, bookmark, event) => {
        console.error(`Handler "${stream}:${bookmark}" failed: `, err)
      },
    }),
    fold: (ev, agg) => {
      switch (ev.type) {
        case 'NameChanged':
          return { name: ev.name }
        default:
          return {}
      }
    },
  },
  {
    /**
     * Command Handlers
     * An object whose contract is mapped from UserCommand:
     * - whose properties match `UserCommand.type`
     * - that takes the matching Command type and the aggregate
     * - returns a promise of Event or void
     */
    createUser: async (cmd, agg) => {
      return { type: 'UserCreated' }
    },
    changeName: async (cmd, agg) => {
      return { type: 'NameChanged', name: cmd.name }
    },
  }
)

const userPopulator = userDomain.handler('user-populator')

userPopulator.handle('NameChanged', async (aggregateId, event, meta) => {
  // The "event" parameter will be the UserEvent:NameChanged type
})

userPopulator.start()

async function example() {
  // Execute a command without the aggregate first
  await userDomain.command.createUser('my-user', {})
  await userDomain.command.changeName('my-user', { name: 'my name' })

  // Execute a command against an aggregate
  const user = await userdomain.getAggregate('my-user')
  if (user.aggregate.version === 0) {
    throw new Error('User does not exist')
  }

  await user.changeName({ name: 'new name' })
}
```

## Handling Multiple Streams

You can create process managers and populators that handle multiple event streams.  
When implementing a handler, the stream name and event type are type safe. The `evtstore` types will narrow the valid event types you can use after providing the event stream.

```ts
import { createHandler } from 'evtstore'
import { createProvider } from 'evtstore/provider/mongo'

type EventMap = {
  users: UserEvent
  game: GameEvent
  profile: ProfileEvent
}

const myHandler = createHandler<EventMap>({
  bookmark: 'my-bookmark',
  provider: createProvider({ ... }),
  streams: ['users', 'game', 'profile']
})

// The compiler will raise an error if you provide an imcompatible stream/event cominbation
myHandler.handle('users', 'UserCreated', async (id, event) => {
  ...
})

myHandler.start()

```

## License

MIT

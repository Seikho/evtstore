# EvtStore

> "Pretty Type Safe(tm)" Event Sourcing for Node.js with TypeScript

## Why

I reguarly use event sourcing and wanted to lower the barrier for entry and increase productivity for colleagues.  
The design goals were:

- Provide as much type safety and inference as possible
- Make creating domains quick and intuitive
- Be easy to test
- Allow developers to focus on application/business problems instead of Event Sourcing and CQRS problems

To obtain these goals the design is highly opinionated, but still flexible.

## Installation

```sh
> yarn add evtstore
# Or
> npm i evtstore
```

`evtstore` is typed with TypeScript and comes with multiple storage "providers":

**See `src/test/util.ts` and `provider.spec.ts` for examples**

`evtstore/provider/memory`

- In memory provider for experimentation.
- This can be initalised with an array of `StoredEvent[]`

`evtstore/provider/knex`

- SQL provider for SQLite and Postgres
- The `knex` and `sqlite3 or pg` dependencies must be installed prior to use
- Bookmark table: `{ bookmark: string, position: number }`
- Events table: `{ stream: string, version: number, position: number, timestamp: DateTime, event: text }`
- A `migrate` function is provided

`evtstore/provider/mongo`

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

type UserCreated = { type: 'UserCreated' }
type NameChanged = { type: 'NameChanged'; name: string }
type UserEvent = UserCreated | NameChanged

type CreateUser = { type: 'createUser' }
type ChangeName = { type: 'changeName'; name: string }
type UserCommand = CreateUser | ChangeName

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
    aggregate: () => ({ name: string }),

    /**
     * Providers:
     * - append and retrieving events (by aggregate id and from a position)
     * - retrieve and update bookmarks
     */
    provider: createProvider(),
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

userPopulator.handle('NameChanged', async (aggregateId, event) => {
  // The "event" parameter will be the NameChanged type
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

## TODO

- Logging

## License

MIT

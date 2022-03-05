# Commands

Command handlers are the intended way to append events to your event log.
The `Event | Event[]` returned from your command handlers are automatically applied to the `aggregateId` on the `Aggregate` object.

## Implementing

**The `aggregateId` is automatically applied to the events you return from your CommandHandler**

## Command Handler

The first parameter is an aggregate from your `Domain` object.  
The second parameter is an object of keys from the `type` property of your `Command` generic parameter.  
The compiler will error if the handler object is not fully implemented.

The returned `CommandHandler` object will be mapped to an object with keys matching the `type` property in your `Command`. See Invoking below.

The `Command` and `Aggregate` types when invoking and implementing are automatically inferred using the generic parameters.

For example:

- `cmd` will automatically infer `{ type: 'createUser', name: string }`
- `agg` will automatically infer `UserAgg`. The `agg` object will also have `.aggregateId` and `.version`.
- The `Aggregate.version` indicates the amount of events the aggregate has. If the `.version === 0`, then the aggregate has no events in the log.

The typical Command Handler signature is:

```ts
type CommandHandler = (command: Command, aggregate: Aggregate) => Promise<Event | Event[] | void>
```

```ts

type UserEvents = ...
type UserAgg = ...
type UserCmd =
 | { type: 'createUser', name: string }
 | { type: 'deleteUser' }
 | { type: 'updateName', newName: string }

const userCmd = createCommands<UserEvents, UserAgg, UserCmd>(aggregates.user, {
  ...,
  // cmd and agg are inferred
  createUser: async (cmd, agg) => { ... }
})
```

## Invoking

The properties on the object returned from `createCommands` are inferred from the `type` property of your generic parameter `Command`.

The first paramter `aggregateId` is passed on the `agg` parameter in the command handler.  
The second parameter `command` will automatically infer the correct type from `UserCmd` based on the function being called.

Commands return the next aggregate. Any events returned from the command are folded onto the `Aggregate` that is passed into the command handler.

```ts
/**
 * The aggregate ID 'user-id' will applied to UserAgg
 * The second parameter `{ name: 'User Name' }`
 */
const nextUser = await userCmd.createUser('user-id', { name: 'User Name' })
```

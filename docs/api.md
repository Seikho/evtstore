## API

### createAggregate

It is important to pass in the `Stream` as a literal to provide the foundation for `Domain.createHandler` intellisense

```ts
type AggregateOptions = {
  stream: string
  create: () => Aggreate
  fold: (event: Event, previous: Aggregate) => Partial<Aggregate>

  /**
   * Used by the aggregate persistence logic - This is to determine whether hydration is okay or not
   * This must be provided to enable aggregate persistence
   */
  version?: string

  /**
   * Whether or not to persist the aggregate when appending events.
   * `version` must be provided as well
   */
  persistAggregate?: boolean
}
function createAggreate<Event, Aggregate, Stream extends string>(
  options: AggregateOptions
): StorableAggregate<Event, Aggregate, Stream>
```

### Aggregate Persistence

⚠️⚠️⚠️ **WARNING: FOOTGUN AHEAD** ⚠️⚠️⚠️  
Using this feature can lead to bugs when not this feature is not used as intended.  
It is incredibly important to update the `version` property passed to `createAggregate` when modifying the `fold` function.  
If you modify the `fold` function, but forget to modify the `version`, this framework will use the persisted aggregate instead of _re-folding_ the aggregate.

For large domains or where performance _really_ matters, the aggregate can be persisted within events to faster aggregate hydration.  
Enable this feature when calling `createAggregate(...)` by passing `.version` and `.persistAggregate: true`.  
The `.version` value is recorded in the persisted copy of the aggregate and later used to determine if you have updated your version.

**IMPORTANT**: When making (breaking) changes to the `fold` function, it is important to increase the `.version` value:

- Doing so will force the aggregate to be re-calculate
- The re-calculation occurs because of a mismatch between the `.version` and the version on the persisted copy of the aggregate
- **Unexpected behaviour can occur if the `fold` function is modified, but the `createAggregate({ version })` is not**

### createDomain

The `Domain` is created separately to allow command handlers to import the domain and retrieve any aggregates it may need to process a command.  
Simply import the domain in your command handler module whenever it is needed.

```ts
type DomainOptions = {
  provider: Provider<any>

  // Enable aggregate caching
  // Only new events will be retrieved since the aggregate was last folded
  useCache?: boolean
}

type AggregateTree = { [key: string]: StorableAggregate }

function createDomain(opts: DomainOptions, aggregates: AggregateTree): Domain
```

### createCommands

Command handlers are centered around appending new events to a single `Aggregate` event stream.  
We import the `Domain` we created with `createDomain` and pass in an aggregate as the first argument of `createCommands`.  
The second argument is an object comprised of command handler functions.

```ts
type CommandHandlers<Cmd> = {
  [key in Cmd['type']]: (
    aggregateId: string,
    event: Event,
    meta: EventMeta
  ) => Promise<Event | void>
}

import { domain } from '...'
function createCommands<Event, Aggregate, Command>(
  aggregate: DomainAggregate,
  handler: CommandHandlers
): CommandHandler
```

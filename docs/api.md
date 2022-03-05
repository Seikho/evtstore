## API

### createAggregate

It is import to pass in the `Stream` as a literal to provide the foundation for `Domain.createHandler` intellisense

```ts
function createAggreate<Event, Aggregate, Stream extends string>(
  stream: Stream,
  factory: () => Aggregate,
  fold: (event: Event, previous: Aggregate) => Partial<Aggregate>
): StorableAggregate<Event, Aggregate, Stream>
```

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

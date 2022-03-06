# Event Handlers

Event handlers are typically used to create read model populators and process managers.  
The factory functions used to create `Event Handlers` are returned from `createDomain`.

For example:

```ts
const { createHandler } = createDomain(
  { provider }, // provider from createProvider()
  { user, profile, posts } // Aggregates from createAggregate<...>()
)
```

## How It Works

Once the `EventHandler` has been started, the **Event Handler Loop** will:

1. Retrieve the `Bookmark` position using the `Provider`
2. Retrieve events after the `Bookmark` position
3. If there are:
   - No events: Wait 500ms and retry Step 2.
   - Some events:
     1. Process each event and update the remote bookmark after each successful event handled
     2. Immediately retry Step 2

## createHandler()

Note that the `Stream` type is inferred from the `Aggregate` stream names when `createDomain` is called.

```ts
function createHandler(bookmark: string, streams: Stream[]): EventHandler
```

## EventHandler

### Handler

```ts
type Handler = (aggregateId: string, event: Event, meta: EventMeta) => Promise<void>
```

The `Event` type is narrowed using the `stream` and `eventType` parameters from calling `handle(stream, eventType, handler)`.

### handle

```ts
function handle(stream: string, eventType: string, handler: Handler)
```

The `stream` and `eventType` parameters are literals that are derived when `createDomain` is called.  
The `eventType` will only allow event types from the `stream` you passed in.

### start()

Begins the **Event Handler Loop**. Typically called when starting your service.  
The handler will

### stop()

Stops processing events. Not typically called.

### runOnce()

Typically used for integration testing.  
`runOnce()` will handle all unprocessed events regardless of the `start`/`stop` state of the handler.

### reset()

Resets the internal bookmark of the event handler.  
This forces the handler to retrieve the remote state of the bookmark on the next iteration.

## Example

```ts
import { createHandler } from '...'

const userModel = createHandler('users-model', ['users'])

userModel.handle('users', 'userCreated', async (id, event, meta) => {
  await mongo.collection('users').insertOne({
    userId: id,
    name: event.name,
    createdAt: meta.timestamp,
  })
})

userModel.start()
```

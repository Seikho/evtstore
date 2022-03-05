# Multiple Streams

Event handlers (i.e., `read models` and `process managers`) can receive inputs from one or more event streams.  
The events **must** all be retrievable from a single `Provider`.

The TypeScript compiler provide significant type safety and intellisense when creating event handler functions provided that `Aggregates` have been created using string literals for `Stream` names.

For example. `createAggregate<UserEvents, UserAggregate, 'user-events'>(...)`

> domain.ts

```ts

import { createProvider } from 'evtstore/provider/...'
import { user, profile, post, subscription } from './aggregates'

const provider = createProvider<any>()
export const { domain, createHandler } = createDomainV2({ provider }, { user, profile, post, subscription })

const readModel = createHandler('my-bookmark', ['user-events', 'profile-events', 'post-events'])

readModel.handle('user-events', 'userCreated', async (id, event) => { ... })
readModel.handle('post-events', 'postCreated', async (id, event) => { ... })
readModel.handle('post-events', 'postEdited',  async (id, event) => { ... })

readModel.start()
```

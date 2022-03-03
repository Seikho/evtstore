import { createAggregate } from '../create-aggregate'
import { createCommands, createStore } from '../create-store'
import { ExampleAgg, ExampleCmd, exampleCmd, ExampleEv, exampleFold } from './example'
import { providers } from './providers'

type AggOne = { count: number }
type AggTwo = { name: string }

type EvtOne = { type: 'inc'; value: number } | { type: 'dec'; value: number }
type EvtTwo = { type: 'set'; value: string }

const one = createAggregate<ExampleEv, ExampleAgg>(
  () => ({ one: 0, two: '', multi: 0, three: [] }),
  exampleFold
)

const two = createAggregate<EvtTwo, AggTwo>(
  () => ({ name: '' }),
  (evt) => {
    return { name: evt.value }
  }
)

describe(`store tests`, () => {
  for (const { name, provider } of providers) {
    describe(`::${name}`, function (this: any) {
      this.timeout(10000)

      const store = createStore(
        { provider: provider() },
        { one: { stream: 'one', aggregate: one }, two: { stream: 'two', aggregate: two } }
      )

      const handler = createCommands(store.one, exampleCmd)

      handler
    })
  }
})

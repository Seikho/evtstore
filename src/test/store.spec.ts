import { expect } from 'chai'
import { createAggregate } from '../create-aggregate'
import { createCommands, createStore } from '../create-store'
import { ExampleAgg, exampleCmd, ExampleEv, exampleFold } from './example'
import { providers } from './providers'
import { tests } from './tests'

// type AggOne = { count: number }
// type EvtOne = { type: 'inc'; value: number } | { type: 'dec'; value: number }

type AggTwo = { name: string }
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
  for (const prv of providers) {
    describe(`::${prv.name}`, function (this: any) {
      this.timeout(10000)

      const store = createStore(
        { provider: prv.provider() },
        { one: { stream: 'one', aggregate: one }, two: { stream: 'two', aggregate: two } }
      )

      const command = createCommands(store.one, exampleCmd)

      for (const { will, input, agg, model, assert } of tests) {
        it(`${prv.name}::${will}`, async () => {
          if (!prv.cache) {
            prv.cache = await prv.provider()
          }

          const provider = prv.cache
          for (const func of input) {
            await func({ command, getAggregate: store.one.getAggregate }, provider, prv.name)
          }

          if (agg) {
            const actual = await store.one.getAggregate(agg.id)
            match(agg, actual)
          }

          if (model) {
            await domain.populator.runOnce()
            const actual = domain.models.get(model.id)
            expect(actual, 'read model exists').to.exist
            match(model, actual)
          }

          if (assert) {
            await assert(domain, provider, prv.name)
          }
        })
      }
    })
  }
})

function match(actual: any, expected: any) {
  for (const key in actual) {
    if (key === 'id') continue
    expect(actual[key], key).to.equal(expected[key])
  }
}

import { tests, registerTestDomain, getDomain } from './tests'
import { expect } from 'chai'
import { providers } from './providers'

describe('provider tests', () => {
  for (const prv of providers) {
    describe(`::${prv.name}`, function (this: any) {
      this.timeout(10000)

      for (const { will, input, agg, model, assert } of tests) {
        it(`${prv.name}::${will}`, async () => {
          if (!prv.cache) {
            prv.cache = await prv.provider()
            registerTestDomain(prv.name, prv.cache)
          }

          const provider = prv.cache
          const domain = getDomain(prv.name)!
          for (const func of input) {
            await func(domain, provider, prv.name)
          }

          if (agg) {
            const actual = await domain.getAggregate(agg.id)
            match(agg, actual.aggregate)
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

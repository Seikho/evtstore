import { Handler, Provider, Domain } from '../types'
import { ExampleEv, ExampleAgg, ExampleCmd, exampleFold, exampleCmd } from './example'
import { createDomainV1 as createDomain } from '../domain'

type Model = {
  one: number
  seen: number
}

export type TestDomain = {
  models: Map<string, Model>
  populator: Handler<ExampleEv>
} & Domain<ExampleEv, ExampleAgg, ExampleCmd>

const domains = new Map<string, TestDomain>()

export function registerTestDomain(name: string, provider: Provider<ExampleEv>) {
  const domain = createDomain(
    {
      provider,
      aggregate: () => ({ one: 0, two: '', three: [], multi: 0 }),
      fold: exampleFold,
      stream: `test-example`,
      useCache: true,
    },
    exampleCmd
  )

  const models = new Map<string, Model>()

  const populator = domain.handler(`${name}-example`)

  populator.handle('one', async (id, ev) => {
    const model = models.get(id) || { one: 0, seen: 0 }
    model.seen++
    model.one += ev.one
    models.set(id, model)
  })

  domains.set(name, { models, populator, ...domain })
  return
}

export function getDomain(name: string) {
  return domains.get(name)
}

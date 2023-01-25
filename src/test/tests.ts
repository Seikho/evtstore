import { Handler, Provider, Domain } from '../types'
import { ExampleEv, ExampleAgg, ExampleCmd, exampleFold, exampleCmd } from './example'
import { createDomainV1 as createDomain } from '../domain'
import { createDomainV2 } from '../domain-v2'
import { createAggregate, createProvidedAggregate } from '../create-aggregate'
import { createCommands } from '../create-command'

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
  // provider.onError = (err) => {
  //   console.error(`[Error:${name}]`, err)
  // }

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

export type TestDomainV2 = ReturnType<typeof createTestDomainV2>

export function createTestDomainV2(
  name: string,
  provider: Provider<ExampleEv>,
  aggVersion: string
) {
  const example = createAggregate<ExampleEv, ExampleAgg, 'test-example'>({
    stream: 'test-example',
    create: () => ({ one: 0, two: '', three: [], multi: 0 }),
    fold: exampleFold,
    version: aggVersion,
    persistAggregate: true,
  })

  const models = new Map<string, Model>()
  const { domain, createHandler } = createDomainV2({ provider, useCache: false }, { example })
  const cmd = createCommands(domain.example, exampleCmd)

  const populator = createHandler(`${name}-example-v2`, ['test-example'])

  populator.handle('test-example', 'one', async (id, ev) => {
    const model = models.get(id) || { one: 0, seen: 0 }
    model.seen++
    model.one += ev.one
    models.set(id, model)
  })

  const providedAgg = (version: string) =>
    createProvidedAggregate<ExampleEv, ExampleAgg>({
      stream: 'test-example',
      aggregate: () => ({ one: 0, two: '', three: [], multi: 0 }),
      fold: exampleFold,
      provider,
      version,
      useCache: false,
    })

  return { domain, cmd, createHandler, populator, provider, providedAgg }
}

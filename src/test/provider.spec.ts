import {
  registerTestDomain,
  getDomain,
  TestDomain,
  createTestDomainV2,
  TestDomainV2,
} from './tests'
import { expect } from 'chai'
import { providers } from './providers'
import { Provider } from '../types'
import { ExampleAgg, ExampleCmd, exampleCmd, ExampleEv, exampleFold } from './example'
import { VersionError } from '../../provider/error'
import { MemoryBookmark } from '../common'
import { createDomainV1 } from '../domain'
import { createHandler } from '../create-handler'

describe('provider tests', () => {
  for (const { provider, name } of providers) {
    let prv: Provider<ExampleEv>
    let domain: TestDomain
    let domainv2: TestDomainV2

    describe(`::${name}`, function (this: any) {
      this.timeout(10000)

      it(`will append an event`, async () => {
        prv = await provider()
        domainv2 = createTestDomainV2(name, prv, 'v1')
        registerTestDomain(name, prv)
        domain = getDomain(name)!
        const actual = await domain.command.doOne('one', { one: 42 })
        match({ one: 42, version: 1 }, actual)
      })

      it('will append a second event', async () => {
        const actual = await domain.command.doOne('one', { one: 84 })
        match({ one: 84, version: 2 }, actual)
      })

      it('will correctly update model using event handler', async () => {
        await domain.populator.runOnce()
        const actual = domain.models.get('one')
        expect(actual).to.exist
      })

      it('will append to new aggregate', async () => {
        const actual = await domain.command.doOne('two', { one: 100 })
        match({ aggregateId: 'two', one: 100, version: 1 }, actual)
      })

      it('will not affect original aggregate/model', async () => {
        const actual = await domain.getAggregate('one')
        match({ aggregateId: 'one', one: 84, version: 2 }, actual.aggregate)
        await domain.populator.runOnce()
        const model = domain.models.get('one')
        match({ one: 126, seen: 2 }, model)
      })

      it('will fetch a bookmark without pre-existing', async () => {
        const bm = await prv.getPosition('undefined')
        expect(bm).to.exist
      })

      it('will throw on version conflict', async () => {
        const storeEvents = prv.createEvents('test-example', 'one', 1, [{ one: 1, type: 'one' }])
        const threw = await prv
          .append('test-example', 'one', 1, storeEvents)
          .then(() => false)
          .catch((err) => err)
        expect(threw instanceof VersionError).to.equal(true)
      })

      it('will return correct aggregate from command', async () => {
        const aggregateId = 'returned-agg'
        const first = await domain.command.doOne(aggregateId, { one: 1 })
        expect(first).to.include({ version: 1, aggregateId, one: 1 })

        const second = await domain.command.doOne(aggregateId, { one: 2 })
        expect(second).to.include({ version: 2, aggregateId, one: 2 })
      })

      it('will handle returning multiple events', async () => {
        const aggregateId = 'multi-agg'

        const first = await domain.command.doMulti(aggregateId, { multi: 1 })
        expect(first).to.include({ version: 2, multi: 2 })

        const second = await domain.command.doMulti(aggregateId, { multi: 2 })
        expect(second).to.include({ version: 4, multi: 6 })
      })

      it('will return valid aggregate using executable aggregate', async () => {
        const first = await domain.getAggregate('multi-agg')
        expect(first.aggregate).to.include({ version: 4, multi: 6 })

        const second = await first.doMulti({ multi: 1 })
        expect(second.aggregate).to.include({ version: 6, multi: 8 })
      })

      it('will return empty aggregate', async () => {
        const actual = await domain.getAggregate('unused-aggregate')
        expect(actual.aggregate).to.deep.include({
          version: 0,
          one: 0,
          two: '',
          three: [],
          multi: 0,
        })
      })

      it('will have non-zero version in command handler', async () => {
        await domain.command.doOne('non-zero', { one: 1 })
        await domain.command.doVersion('non-zero', {})
      })

      it('will correctly use in-memory bookmark', async () => {
        let count = 0
        const pop = domain.handler(MemoryBookmark)
        pop.handle('one', async () => {
          ++count
        })
        await pop.runOnce()
        expect(count).to.equal(6)
        await pop.runOnce()
        expect(count).to.equal(6)
        await domain.command.doOne('in-memory', { one: 1 })
        await pop.runOnce()
        expect(count).to.equal(7)
      })

      it('will correctly handle multiple streams in a single handler', async () => {
        const testId = 'two-streams'
        const { second, handler } = getSecondDomain(prv)
        let firstCount = 0
        let secondCount = 0

        handler.handle('test-example', 'one', async (id) => {
          if (id !== testId) return
          ++firstCount
        })

        handler.handleStream('test-second', {
          one: async (id) => {
            if (id !== testId) return
            ++secondCount
          },
        })

        await domain.command.doOne(testId, { one: 1 })
        await domain.command.doOne(testId, { one: 1 })
        await second.command.doOne(testId, { one: 1 })
        await second.command.doOne('diff', { one: 1 })

        await handler.runOnce()
        expect(firstCount).to.equal(2)
        expect(secondCount).to.equal(1)
      })

      it('will start at end of stream when "tailStream" option is true', async () => {
        let count = 0
        const pop = domain.handler('start-tail', { tailStream: true })
        pop.handle('one', async () => {
          ++count
        })

        await pop.runOnce()
        expect(count).to.equal(0)
      })

      it('will always start at end of stream when "alwaysTailStream" is true', async () => {
        let count = 0
        const pop = domain.handler('start-tail', { alwaysTailStream: true })
        pop.handle('one', async () => {
          ++count
        })

        await pop.runOnce()
        expect(count).to.equal(0)

        await domain.command.doOne('alwaysTailStream', { one: 1 })
        pop.reset()
        await pop.runOnce()
        expect(count).to.equal(0)
      })

      it('will handle an event when appended after starting alwaysTailStream handler', async () => {
        let count = 0
        const pop = domain.handler('start-tail', { alwaysTailStream: true })
        pop.handle('one', async () => {
          ++count
        })

        await pop.runOnce()
        expect(count).to.equal(0)

        await domain.command.doOne('alwaysTailStream', { one: 1 })
        await pop.runOnce()
        expect(count).to.equal(1)
      })

      it('will continue processing events when "continueOnError" is set', async () => {
        let count = 0
        const name = 'thrower'
        const pop = domain.handler(name, { continueOnError: true, tailStream: true })

        pop.handle('one', async () => {
          ++count
        })

        pop.handle('throw', async () => {
          throw new Error('Fail')
        })

        await pop.runOnce()
        expect(count).to.eq(0)

        await domain.command.doThrow(name, {})
        await domain.command.doOne(name, { one: 1 })
        await pop.runOnce()
        expect(count).to.equal(1)
      })

      it('will not continue processing events when "continueOnError" is not set', async () => {
        let count = 0
        const name = 'non-thrower'
        const pop = domain.handler(name, { continueOnError: false, tailStream: true })

        pop.handle('one', async () => {
          ++count
        })

        pop.handle('throw', async () => {
          throw new Error('Fail')
        })

        await pop.runOnce()
        expect(count).to.eq(0)

        await domain.command.doThrow(name, {})
        await domain.command.doOne(name, { one: 1 })
        await pop.runOnce().catch(() => {})
        expect(count).to.equal(0)
      })

      it('will not contain a persisted aggregate when not configured', async () => {
        const name = 'persist-test'
        await domain.command.doOne(name, { one: 1 })
        const lastEvent = await domainv2.provider.getLastEventFor('test-example', name)
        expect(lastEvent!.event.__persisted).to.be.undefined
      })

      it('will persist the aggregate when configured', async () => {
        const name = 'persisted'
        await domainv2.cmd.doMulti(name, { multi: 2 })
        const lastEvent = await domainv2.provider.getLastEventFor('test-example', name)
        expect(lastEvent!.event.__persisted).to.exist
      })

      it('will hydrate the aggregate from the last event', async () => {
        const agg = await domainv2.domain.example.getAggregate('persisted')
        expect(agg.__pv).to.equal('v1')
        expect(agg.multi).to.equal(4)
      })

      it('will not hydrate the aggregate when a version mismatch occurs', async () => {
        domainv2 = createTestDomainV2(name, prv, 'v2')
        const agg = await domainv2.domain.example.getAggregate('persisted')
        expect(agg.__pv).to.be.undefined
      })

      it('will persist aggregate with a new version', async () => {
        const name = 'persisted'
        await domainv2.cmd.doMulti(name, { multi: 4 })
        const lastEvent = await domainv2.provider.getLastEventFor('test-example', name)
        expect(lastEvent!.event.__persisted.__pv).to.equal('v2')
      })

      it('will hydrate the aggregate with the new version', async () => {
        const agg = await domainv2.domain.example.getAggregate('persisted')
        expect(agg.__pv).to.equal('v2')
        expect(agg.multi).to.equal(12)
      })

      it('will not hydrate the aggregate when a version mismatch occurs', async () => {
        const agg = await domainv2.providedAgg('v3').getAggregate('persisted')
        expect(agg.__pv).to.be.undefined
      })
    })
  }
})

function match(actual: any, expected: any) {
  for (const key in actual) {
    if (key === 'id') continue
    expect(actual[key], key).to.equal(expected[key])
  }
}

function getSecondDomain(prv: Provider<ExampleEv>) {
  const second = createDomainV1<ExampleEv, ExampleAgg, ExampleCmd>(
    {
      provider: prv,
      aggregate: () => ({ one: 0, two: '', three: [], multi: 0 }),
      fold: exampleFold,
      stream: `test-second`,
    },
    exampleCmd
  )

  type Events = {
    'test-example': ExampleEv
    'test-second': ExampleEv
  }

  const handler = createHandler<Events>({
    bookmark: 'two-handler',
    streams: [`test-example`, `test-second`],
    provider: prv,
  })

  return { second, handler }
}

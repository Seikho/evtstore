import { expect } from 'chai'
import { createProvider } from '../src/provider/memory'
import { createDomain } from '../src'
import {
  ExampleEv,
  ExampleAgg,
  ExampleCmd,
  exampleFold,
  exampleCmd,
} from './example'

const { command, getAggregate, handler } = createDomain<
  ExampleEv,
  ExampleAgg,
  ExampleCmd
>(
  {
    aggregate: () => ({ one: 0, two: '', three: [] }),
    fold: exampleFold,
    provider: createProvider(),
    stream: 'example',
  },
  exampleCmd
)

const model = handler('bm')
const readModel = {
  v: 0,
  last: '',
}
model.handle('one', async ev => {
  readModel.v++
  readModel.last = ev.type
})

model.handle('two', async ev => {
  readModel.v++
  readModel.last = ev.type
})

describe('in memory provider::commands', () => {
  it('will append an event', async () => {
    await command.doOne('1', { one: 1 })
    const actual = await getAggregate('1')
    expect(actual.one).to.equal(1)
  })

  it('will append a 2nd event', async () => {
    await command.doTwo('1', { two: 'two' })
    const actual = await getAggregate('1')
    expect(actual.two).to.equal('two')
    expect(actual.version).to.equal(2)
  })

  it('will add an event for a new aggregate', async () => {
    await command.doOne('2', { one: 10 })
    const actual = await getAggregate('2')
    expect(actual.one).to.equal(10)
    expect(actual.version).to.equal(1)
  })

  it('will not mutate the first aggregate', async () => {
    const actual = await getAggregate('1')
    expect(actual).to.deep.equal({
      aggregateId: '1',
      one: 1,
      two: 'two',
      three: [],
      version: 2,
    })
  })
})

describe('in memory provider::handler', () => {
  it('will process an event', async () => {
    await model.runOnce()
    expect(readModel.v).to.equal(3)
    expect(readModel.last).to.equal('one')
  })
})

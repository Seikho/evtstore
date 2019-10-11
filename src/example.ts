import { createDomain } from './domain'

type EvOne = { type: 'one'; one: number }
type EvTwo = { type: 'two'; two: string }
type EvThree = { type: 'three'; three: number[] }
type MyEv = EvOne | EvTwo | EvThree

type MyAgg = { one: number; two: string; three: number[] }

function myFold(ev: EvOne | EvTwo | EvThree, _agg: MyAgg): Partial<MyAgg> {
  switch (ev.type) {
    case 'one':
      return { one: ev.one }
    case 'two':
      return { two: ev.two }
    case 'three':
      return { three: ev.three }
  }
}

type DoOne = { type: 'doOne'; one: number }
type DoTwo = { type: 'doTwo'; two: string }
type DoThree = { type: 'doThree'; three: number[] }

type MyCmd = DoOne | DoTwo | DoThree

const foo = createDomain<MyEv, MyAgg, MyCmd>(
  {
    fold: myFold,
    provider: {} as any,
    stream: 'foo',
    aggregate: () => ({ one: 0, two: '', three: [] }),
  },
  {
    async doOne(cmd, _agg) {
      return { type: 'one', one: cmd.one }
    },
    async doTwo(cmd, _agg) {
      return { type: 'two', two: cmd.two }
    },
    async doThree(cmd, _agg) {
      return { type: 'three', three: cmd.three }
    },
  }
)

foo.command.doOne('', { one: 42 })
foo.command.doTwo('', { two: 'value' })
foo.command.doThree('', { three: [1, 2, 3] })

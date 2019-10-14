import { CommandHandler } from '../types'

export type EvOne = { type: 'one'; one: number }
export type EvTwo = { type: 'two'; two: string }
export type EvThree = { type: 'three'; three: number[] }
export type ExampleEv = EvOne | EvTwo | EvThree

export type ExampleAgg = { one: number; two: string; three: number[] }

export function exampleFold(ev: EvOne | EvTwo | EvThree, _agg: ExampleAgg): Partial<ExampleAgg> {
  switch (ev.type) {
    case 'one':
      return { one: ev.one }
    case 'two':
      return { two: ev.two }
    case 'three':
      return { three: ev.three }
  }
}

export type DoOne = { type: 'doOne'; one: number }
export type DoTwo = { type: 'doTwo'; two: string }
export type DoThree = { type: 'doThree'; three: number[] }

export type ExampleCmd = DoOne | DoTwo | DoThree

export const exampleCmd: CommandHandler<ExampleEv, ExampleAgg, ExampleCmd> = {
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

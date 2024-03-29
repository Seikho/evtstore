import { CommandHandler } from '../types'

export type EvOne = { type: 'one'; one: number }
export type EvTwo = { type: 'two'; two: string }
export type EvThree = { type: 'three'; three: number[] }
export type EvMulti = { type: 'multi'; multi: number }
export type EvVersion = { type: 'version' }
export type EvThrow = { type: 'throw' }
export type ExampleEv = EvOne | EvTwo | EvThree | EvMulti | EvVersion | EvThrow

export type ExampleAgg = { one: number; two: string; three: number[]; multi: number }

export function exampleFold(ev: ExampleEv, agg: ExampleAgg): Partial<ExampleAgg> {
  switch (ev.type) {
    case 'one':
      return { one: ev.one }

    case 'two':
      return { two: ev.two }

    case 'three':
      return { three: ev.three }

    case 'multi':
      return { multi: ev.multi + agg.multi }

    case 'version':
    case 'throw':
      return {}
  }
}

export type DoOne = { type: 'doOne'; one: number }
export type DoTwo = { type: 'doTwo'; two: string }
export type DoThree = { type: 'doThree'; three: number[] }
export type DoMulti = { type: 'doMulti'; multi: number }
export type DoThrow = { type: 'doThrow' }
export type DoVersion = { type: 'doVersion' }

export type ExampleCmd = DoOne | DoTwo | DoThree | DoMulti | DoVersion | DoThrow

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
  async doMulti(cmd, _agg) {
    return [
      { type: 'multi', multi: cmd.multi },
      { type: 'multi', multi: cmd.multi },
    ]
  },
  async doVersion(_, agg) {
    if (agg.version === 0) throw new Error('Non-zero version')
    return { type: 'version' }
  },
  async doThrow() {
    return { type: 'throw' }
  },
}

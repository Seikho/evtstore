export type Evt<T extends string, B extends {}> = { type: T } & B
export type Cmd<T extends string, B extends {}> = { type: T } & B

export type UserEvt = {
  type: string
}

export type UserCmd = {
  type: string
}

export type StoredEvt<T = unknown> = {
  stream: string
  position: any
  version: number
  timestamp: Date
  event: T
  aggregateId: string
}

export type UserAgg = {}

type ID = { aggregateId: string }

export type BaseAgg = { version: number; aggregateId: string }

export type Fold<E extends UserEvt, A extends UserAgg> = (ev: E, agg: A) => Partial<A>

export type Provider<Evt extends UserEvt> = {
  driver: string
  getPosition(bookmark: string): Promise<any>
  setPosition(bookmark: string, position: any): Promise<void>
  getEventsFrom(stream: string, position: any): Promise<Array<StoredEvt<Evt>>>
  getEventsFor(stream: string, aggregateId: string): Promise<Array<StoredEvt<Evt>>>
  append(stream: string, event: Evt, aggregateId: string, version: number): Promise<void>
}

export type Handler<E extends UserEvt> = {
  start(): void
  stop(): void
  reset(): void
  runOnce(): Promise<number>
  handle: <T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>) => Promise<any>
  ) => void
}

export type Ext<E extends UserEvt, T extends E['type']> = E extends {
  type: T
}
  ? E
  : never

export type Command<E extends UserEvt, A extends UserAgg, C extends UserCmd> = {
  [key in C['type']]: (cmd: ExtCmd<C, key> & ID, agg: A) => Promise<(E) | void>
}

export type Domain<E extends UserEvt, A extends UserAgg, C extends UserCmd> = {
  handler(bookmark: string): Handler<E>
  command: CmdBody<C>
  getAggregate(id: string): Promise<A & BaseAgg>
}

export type ExtCmd<C extends UserCmd, T extends C['type']> = Omit<Ext<C, T>, 'type'>

export type CmdBody<C extends UserCmd> = {
  [cmd in C['type']]: (aggId: string, body: ExtCmd<C, cmd>) => Promise<void>
}

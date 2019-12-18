export type Event = { type: string }
export type Command = { type: string }
export type Aggregate = {}

export type StoreEvent<T = unknown> = EventMeta & { event: T }

export type EventMeta = {
  stream: string
  position: any
  version: number
  timestamp: Date
  aggregateId: string
}

type ID = { aggregateId: string }

export type BaseAggregate = { version: number; aggregateId: string }

export type Fold<E extends Event, A extends Aggregate> = (
  ev: E,
  agg: A & BaseAggregate,
  meta: EventMeta
) => Partial<A>

export type Provider<Evt extends Event> = {
  driver: string
  getPosition(bookmark: string): Promise<any>
  setPosition(bookmark: string, position: any): Promise<void>
  getEventsFrom(stream: string, position: any): Promise<Array<StoreEvent<Evt>>>
  getEventsFor(stream: string, aggregateId: string): Promise<Array<StoreEvent<Evt>>>
  append(
    stream: string,
    aggregateId: string,
    version: number,
    event: Evt[]
  ): Promise<Array<StoreEvent<Evt>>>
}

export type Handler<E extends Event> = {
  start(): void
  stop(): void
  reset(): void
  runOnce(): Promise<number>
  handle: <T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>, meta: EventMeta) => Promise<any>
  ) => void
}

export type Ext<E extends Event, T extends E['type']> = E extends {
  type: T
}
  ? E
  : never

export type CommandHandler<E extends Event, A extends Aggregate, C extends Command> = {
  [key in C['type']]: (cmd: ExtCmd<C, key> & ID, agg: A) => Promise<E | E[] | void>
}

export type Domain<E extends Event, A extends Aggregate, C extends Command> = {
  handler(bookmark: string): Handler<E>
  command: CmdBody<C, A>
  getAggregate(
    id: string
  ): Promise<ExecutableAggregate<C, A> & { aggregate: Readonly<A & BaseAggregate> }>
  retry?: boolean
}

export type ExtCmd<C extends Command, T extends C['type']> = Omit<Ext<C, T>, 'type'>

export type CmdBody<C extends Command, A extends Aggregate> = {
  [cmd in C['type']]: (aggId: string, body: ExtCmd<C, cmd>) => Promise<A & BaseAggregate>
}

export type ExecutableAggregate<C extends Command, A extends Aggregate> = {
  [cmd in C['type']]: (
    body: ExtCmd<C, cmd>
  ) => Promise<ExecutableAggregate<C, A> & { aggregate: Readonly<A & BaseAggregate> }>
}

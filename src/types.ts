export type HandlerHooks = {
  preRun?: () => Promise<void>
  postRun?: (events: number, handled: number) => Promise<void>
}

export type Event = { type: string }
export type Command = { type: string }
export type Aggregate = {}

export type StoreEvent<T = unknown> = EventMeta & { event: T }

export type ProviderBookmark = {
  readonly name: string
  getPosition(): Promise<any>
  setPosition(position: any): Promise<void>
}

export type DomainOptions<E extends Event, A extends Aggregate> = {
  aggregate: () => A
  stream: string
  fold: Fold<E, A>
  provider: Provider<E> | Promise<Provider<E>>
  useCache?: boolean
}

export type StreamsHandler<T extends { [key: string]: Event }> = <
  TStream extends keyof T,
  TType extends T[TStream]['type']
>(
  stream: TStream,
  type: TType,
  handler: (id: string, event: Ext<T[TStream], TType>, meta: EventMeta) => any
) => void

export type HandlerBookmark = string | ProviderBookmark

export type EventMeta = {
  stream: string
  position: any
  version: number
  timestamp: Date
  aggregateId: string
}

export type ErrorCallback = (
  err: any,
  stream: string,
  bookmark: string,
  event?: Event & { [key: string]: any }
) => any

type ID = { aggregateId: string }

export type BaseAggregate = { version: number; aggregateId: string }

export type Fold<E extends Event, A extends Aggregate> = (
  ev: E,
  agg: A & BaseAggregate,
  meta: EventMeta
) => Partial<A>

export type Provider<Evt extends Event> = {
  driver: string
  onError: ErrorCallback
  getPosition(bookmark: string): Promise<any>
  setPosition(bookmark: string, position: any): Promise<void>
  getEventsFrom(
    stream: string | string[],
    position: any,
    limit?: number
  ): Promise<Array<StoreEvent<Evt>>>
  getEventsFor(
    stream: string,
    aggregateId: string,
    fromPosition?: any
  ): Promise<Array<StoreEvent<Evt>>>
  getLastEventFor(
    stream: string | string[],
    aggregateId?: string
  ): Promise<StoreEvent<Evt> | undefined>
  append(
    stream: string,
    aggregateId: string,
    version: number,
    event: Evt[]
  ): Promise<Array<StoreEvent<Evt>>>
  limit?: number
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
  handlers: (body: HandlerBody<E>) => void
  name: string
}

export type Ext<E extends Event, T extends E['type']> = E extends {
  type: T
}
  ? E
  : never

export type CommandHandler<E extends Event, A extends Aggregate, C extends Command> = {
  [key in C['type']]: (cmd: OptCmd<C, key> & ID, agg: A & BaseAggregate) => Promise<E | E[] | void>
}

export type DomainHandlerOpts = {
  hooks?: HandlerHooks
  /** Start handling events from the end of the stream */
  tailStream?: boolean

  /** Every time the handler starts, always start from the end of the stream */
  alwaysTailStream?: boolean

  /** When a handler throws, continue processing events */
  continueOnError?: boolean
}

export type Domain<E extends Event, A extends Aggregate, C extends Command> = {
  handler(bookmark: string, options?: DomainHandlerOpts): Handler<E>
  command: CmdBody<C, A>
  getAggregate(
    id: string
  ): Promise<ExecutableAggregate<C, A> & { aggregate: Readonly<A & BaseAggregate> }>
  retry?: boolean
}

export type CmdBody<C extends Command, A extends Aggregate> = {
  [cmd in C['type']]: (aggId: string, body: ExtCmd<C, cmd>) => Promise<A & BaseAggregate>
}

export type ExecutableAggregate<C extends Command, A extends Aggregate> = {
  [cmd in C['type']]: (
    body: ExtCmd<C, cmd>
  ) => Promise<ExecutableAggregate<C, A> & { aggregate: Readonly<A & BaseAggregate> }>
}

type ExtCmd<C extends Command, T extends C['type']> = Omit<Ext<C, T>, 'type'>

type OptCmd<C extends Command, T extends C['type']> = Omit<Ext<C, T>, 'type'> & { type: T }

export type HandlerBody<E extends Event> = {
  [evt in E['type']]?: (id: string, evt: Ext<E, evt>, meta: EventMeta) => Promise<any>
}

export type StorableAggregate<
  E extends Event = any,
  A extends Aggregate = any,
  S extends string = string
> = {
  stream: S
  fold: Fold<E, A>
  aggregate: () => A
}

export type AggregateStore = { [key: string]: StorableAggregate }

export type ProvidedAggregate<E extends Event, A extends Aggregate, S extends string = string> = {
  stream: S
  provider: Provider<E> | Promise<Provider<E>>
  getAggregate: (id: string) => Promise<A & BaseAggregate>
  toNextAggregate: (prev: A & BaseAggregate, event: StoreEvent<E>) => A & BaseAggregate
}

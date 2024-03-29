import { DomainHandlerOpts } from './src/types'

export { createDomainV1 } from './src/domain'
export { createHandler } from './src/create-handler'
export { createBookmark } from './src/create-bookmark'
export { createDomainV2, createDomain } from './src/domain-v2'
export {
  createAggregate,
  createProvidedAggregate,
  createPersistedAggregate,
} from './src/create-aggregate'
export { createCommands } from './src/create-command'
export {
  Domain,
  Provider,
  Event,
  Fold,
  Command,
  CommandHandler,
  Handler,
  CmdBody,
  EventMeta,
  StoreEvent,
  StreamsHandler,
  Aggregate,
  BaseAggregate,
  DomainHandlerOpts,
  DomainOptions,
  AggregateStore,
  ErrorCallback,
  HandlerBody,
  HandlerBookmark,
  HandlerHooks,
  ProvidedAggregate,
  StorableAggregate,
  ProviderBookmark,
  ExecutableAggregate,
  Ext,
} from './src/types'
export { VersionError, CommandError } from './provider/error'
export { MemoryBookmark } from './src/common'

export { DomainHandlerOpts as HandlerOptsV1, DomainHandlerOpts as HandlerOptions }

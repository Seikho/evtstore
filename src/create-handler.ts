import { EventHandler } from './event-handler'
import {
  EventMeta,
  HandlerBookmark,
  Provider,
  StreamsHandler,
  Event,
  HandlerBody,
  HandlerHooks,
} from './types'

type Options<Body extends { [key: string]: Event }> = {
  bookmark: HandlerBookmark
  streams: Array<keyof Body>
  provider: Provider<Event> | Promise<Provider<Event>>
  hooks?: HandlerHooks
}

export function createHandler<Body extends { [key: string]: Event }>(options: Options<Body>) {
  const handler = new EventHandler({
    bookmark: options.bookmark,
    provider: options.provider,
    stream: options.streams as string[],
    hooks: options.hooks,
  })

  type CB = (id: string, event: Event, meta: EventMeta) => any

  const callbacks = new Map<string, CB>()

  const handle: StreamsHandler<Body> = (stream, type, callback) => {
    callbacks.set(`${stream.toString()}-${type}`, callback as any)

    handler.handle(type, (id, event, meta) => {
      const cb = callbacks.get(`${meta.stream}-${event.type}`)
      if (!cb) return

      return cb(id, event as any, meta)
    })
  }

  const handleStream = <S extends keyof Body>(stream: S, handlers: HandlerBody<Body[S]>) => {
    for (const [type, handler] of Object.entries(handlers)) {
      handle(stream, type, handler as any)
    }
  }

  return {
    handle,
    handleStream,
    start: handler.start,
    stop: handler.stop,
    runOnce: handler.runOnce,
    run: handler.run,
    setPosition: handler.setPosition,
    getPosition: handler.getPosition,
    reset: handler.reset,
    __handler: handler,
    name: handler.name,
  }
}

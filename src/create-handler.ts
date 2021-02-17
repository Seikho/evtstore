import { EventHandler, HandlerHooks } from './event-handler'
import { EventMeta, HandlerBookmark, Provider, StreamsHandler, Event } from './types'

type Options<Body extends { [key: string]: Event }> = {
  bookmark: HandlerBookmark
  streams: Array<keyof Body>
  provider: Provider<Event>
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
  type StreamCB<S extends keyof Body> = (id: string, event: Body[S], meta: EventMeta) => any

  const callbacks = new Map<string, CB>()
  const streamCallbacks = new Map<keyof Body, StreamCB<any>>()

  const handle: StreamsHandler<Body> = (stream, type, callback) => {
    callbacks.set(`${stream}-${type}`, callback as any)

    handler.handle(type, (id, event, meta) => {
      const cb = callbacks.get(`${meta.stream}-${event.type}`)
      if (!cb) return

      return cb(id, event as any, meta)
    })
  }

  const handleStream = <S extends keyof Body>(stream: S, callback: StreamCB<S>) => {
    streamCallbacks.set(stream, callback)
    handler.handleAll((id, ev, meta) => {
      if (meta.stream !== stream) return

      return callback(id, ev as any, meta)
    })
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
  }
}

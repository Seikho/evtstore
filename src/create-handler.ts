import { EventHandler } from './event-handler'
import { EventMeta, HandlerBookmark, Provider, StreamsHandler, Event } from './types'

export function createHandler<Body extends { [key: string]: Event }>(
  bookmark: HandlerBookmark,
  streams: Array<keyof Body>,
  provider: Provider<Event>
) {
  const handler = new EventHandler({
    bookmark,
    provider,
    stream: streams as string[],
  })

  type CB = (id: string, event: Event, meta: EventMeta) => any
  const callbacks = new Map<string, CB>()

  const handle: StreamsHandler<Body> = (stream, type, callback) => {
    callbacks.set(`${stream}-${type}`, callback as any)

    handler.handle(type, (id, event, meta) => {
      const cb = callbacks.get(`${meta.stream}-${event.type}`)
      if (!cb) return

      return cb(id, event as any, meta)
    })
  }

  return {
    handle,
    start: handler.start,
    stop: handler.stop,
    runOnce: handler.runOnce,
    run: handler.run,
    setPosition: handler.setPosition,
    getPosition: handler.getPosition,
    reset: handler.reset,
  }
}

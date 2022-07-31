import {
  Event,
  Provider,
  Ext,
  Handler,
  EventMeta,
  HandlerBookmark,
  HandlerBody,
  HandlerHooks,
  DomainHandlerOpts,
} from './types'
import { toMeta, MemoryBookmark } from './common'
import { isPositionZero, toArray } from '../provider/util'

const POLL = 1000
const CRASH = 10000

type Options<E extends Event> = {
  stream: string | string[]
  bookmark: HandlerBookmark
  provider: Provider<E> | Promise<Provider<E>>
  hooks?: HandlerHooks
} & DomainHandlerOpts

export class EventHandler<E extends Event> implements Handler<E> {
  name: string
  private bookmark: HandlerBookmark
  private streams: string[]
  private provider: Provider<E> = null as any
  private position: any
  private running = false
  private tailStream = false
  private alwaysTailStream = false
  private continueOnError = false

  private __handlers: {
    [eventType: string]: (id: string, ev: E, meta: EventMeta) => Promise<any>
  } = {}
  private hooks: HandlerHooks = {}

  constructor(opts: Options<E>) {
    this.bookmark = opts.bookmark
    this.streams = toArray(opts.stream)
    this.hooks = opts.hooks || {}
    this.provider = opts.provider as any
    this.name = typeof opts.bookmark === 'string' ? opts.bookmark : opts.bookmark.name
    this.tailStream = opts.tailStream ?? false
    this.alwaysTailStream = opts.alwaysTailStream ?? false
    this.continueOnError = opts.continueOnError ?? false

    if (this.streams.length === 0) {
      throw new Error('Cannot create event handler subscribed to no streams')
    }

    if ('then' in opts.provider) {
      opts.provider.then((prv) => {
        this.provider = prv
      })
    }

    this.run()
  }

  handle = <T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>, meta: EventMeta) => Promise<void>
  ) => {
    this.__handlers[type] = cb as any
  }

  handlers = (body: HandlerBody<E>) => {
    const keys = Object.keys(body) as Array<E['type']>
    for (const key of keys) {
      this.__handlers[key] = body[key] as any
    }
  }

  start = () => {
    this.running = true
  }

  stop = () => {
    this.running = false
  }

  reset = () => {
    this.position = undefined
  }

  runOnce = async (runningCount = 0): Promise<number> => {
    if (this.hooks.preRun) {
      await this.hooks.preRun()
    }

    if (!this.position) {
      this.position = await this.getPosition()
    }

    const events = await this.provider.getEventsFrom(this.streams, this.position)
    let eventsHandled = 0

    const onError = (ex: any) => {
      ex.event = events[eventsHandled]

      if (this.continueOnError) {
        const bookmarkName = typeof this.bookmark === 'string' ? this.bookmark : this.bookmark.name
        this.provider.onError(ex, this.streams.join(', '), bookmarkName, ex.event)
        return
      }

      throw ex
    }

    for (const event of events) {
      const handler = this.__handlers[event.event.type]
      if (handler) {
        await Promise.resolve(handler(event.aggregateId, event.event, toMeta(event))).catch(onError)
        eventsHandled++
      }
      this.position = event.position
      await this.setPosition()
    }

    if (this.hooks.postRun) {
      await this.hooks.postRun(events.length, eventsHandled)
    }

    if (events.length > 0) {
      return this.runOnce(events.length + runningCount)
    }

    return events.length + runningCount
  }

  getPosition = async () => {
    if (this.bookmark === MemoryBookmark) {
      if (this.position) return this.position

      if (this.alwaysTailStream) {
        const event = await this.provider.getLastEventFor(this.streams)
        this.position = event?.position || 0
        return event
      }

      const notExistantBookmark = new Date().toISOString()
      const position = await this.provider.getPosition(notExistantBookmark)
      this.position = position
      return position
    }

    if (this.alwaysTailStream) {
      const event = await this.provider.getLastEventFor(this.streams)
      if (event) return event.position
    }

    const bm =
      typeof this.bookmark === 'string'
        ? await this.provider.getPosition(this.bookmark as string)
        : await this.bookmark.getPosition()

    // If this is a new handler without a position, we may need to start from the end of the stream(s) history
    if (this.tailStream && isPositionZero(bm)) {
      const event = await this.provider.getLastEventFor(this.streams)
      return event?.position || bm
    }

    // Otherwise return the start of the beginning of the stream(s) history
    return bm
  }

  setPosition = async () => {
    if (this.bookmark === MemoryBookmark) {
      return
    }

    if (typeof this.bookmark === 'string') {
      await this.provider.setPosition(this.bookmark as string, this.position)
      return
    }

    await this.bookmark.setPosition(this.position)
  }

  run = async () => {
    if (!this.running) {
      setTimeout(this.run, POLL)
      return
    }

    try {
      const handled = await this.runOnce()
      setTimeout(this.run, handled === 0 ? POLL : 0)
    } catch (ex: any) {
      const bookmarkName = typeof this.bookmark === 'string' ? this.bookmark : this.bookmark.name
      this.provider.onError(ex, this.streams.join(', '), bookmarkName, ex.event)
      setTimeout(this.run, CRASH)
    }
  }
}

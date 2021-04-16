import { Event, Provider, Ext, Handler, EventMeta, HandlerBookmark } from './types'
import { toMeta, MemoryBookmark } from './common'
import { toArray } from '../provider/util'

const POLL = 1000
const CRASH = 10000

export type HandlerHooks = {
  preRun?: () => Promise<void>
  postRun?: (events: number, handled: number) => Promise<void>
}

type Options<E extends Event> = {
  stream: string | string[]
  bookmark: HandlerBookmark
  provider: Provider<E> | Promise<Provider<E>>
  hooks?: HandlerHooks
}

export class EventHandler<E extends Event> implements Handler<E> {
  private bookmark: HandlerBookmark
  private streams: string[]
  private provider: Provider<E> = null as any
  private position: any
  private running = false
  private handlers: {
    [eventType: string]: (id: string, ev: E, meta: EventMeta) => Promise<any>
  } = {}
  private hooks: HandlerHooks = {}

  constructor(opts: Options<E>) {
    this.bookmark = opts.bookmark
    this.streams = toArray(opts.stream)
    this.hooks = opts.hooks || {}
    this.provider = opts.provider as any

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
    this.handlers[type] = cb as any
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
      throw ex
    }

    for (const event of events) {
      const handler = this.handlers[event.event.type]
      if (handler) {
        await handler(event.aggregateId, event.event, toMeta(event)).catch(onError)
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
      const notExistantBookmark = new Date().toISOString()
      const position = await this.provider.getPosition(notExistantBookmark)
      this.position = position
      return position
    }

    if (typeof this.bookmark === 'string') {
      return this.provider.getPosition(this.bookmark as string)
    }

    return this.bookmark.getPosition()
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
    } catch (ex) {
      const bookmarkName = typeof this.bookmark === 'string' ? this.bookmark : this.bookmark.name
      this.provider.onError(ex, this.streams.join(', '), bookmarkName, ex.event)
      setTimeout(this.run, CRASH)
    }
  }
}

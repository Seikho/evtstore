import { Event, Provider, Ext, Handler, EventMeta, HandlerBookmark } from './types'
import { toMeta, MemoryBookmark } from './common'
import { toArray } from '../provider/util'

const POLL = 1000
const CRASH = 10000

type Options<E extends Event> = {
  stream: string | string[]
  bookmark: HandlerBookmark
  provider: Provider<E> | Promise<Provider<E>>
}

export class EventHandler<E extends Event> implements Handler<E> {
  private bookmark: HandlerBookmark
  private streams: string[]
  private provider: Promise<Provider<E>>
  private position: any
  private running = false
  private handlers = new Map<E['type'], (id: string, ev: E, meta: EventMeta) => Promise<any>>()

  constructor(opts: Options<E>) {
    this.bookmark = opts.bookmark
    this.streams = toArray(opts.stream)

    if (this.streams.length === 0) {
      throw new Error('Cannot create event handler subscribed to no streams')
    }

    this.provider = Promise.resolve(opts.provider)
    this.run()
  }

  handle = <T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>, meta: EventMeta) => Promise<void>
  ) => {
    this.handlers.set(type, cb as any)
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
    const provider = await this.provider
    if (!this.position) {
      this.position = await this.getPosition()
    }

    const events = await provider.getEventsFrom(this.streams, this.position)

    for (const event of events) {
      const handler = this.handlers.get(event.event.type)
      if (handler) {
        try {
          await handler(event.aggregateId, event.event, toMeta(event))
        } catch (ex) {
          ex.event = event
          throw ex
        }
      }
      this.position = event.position
      await this.setPosition()
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
      const position = await this.provider.then((prv) => prv.getPosition(notExistantBookmark))
      this.position = position
      return position
    }

    if (typeof this.bookmark === 'string') {
      return this.provider.then((prv) => prv.getPosition(this.bookmark as string))
    }

    return this.bookmark.getPosition()
  }

  setPosition = async () => {
    if (this.bookmark === MemoryBookmark) {
      return
    }

    if (typeof this.bookmark === 'string') {
      await this.provider.then((prv) => prv.setPosition(this.bookmark as string, this.position))
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
      await this.provider.then((prv) =>
        prv.onError(ex, this.streams.join(', '), bookmarkName, ex.event)
      )
      setTimeout(this.run, CRASH)
    }
  }
}

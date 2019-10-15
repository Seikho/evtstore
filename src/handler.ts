import { Event, Provider, Ext, Handler, EventMeta } from './types'
import { toMeta } from './common'

const POLL = 1000
const CRASH = 10000

type Options<E extends Event> = {
  stream: string
  bookmark: string
  provider: Provider<E> | Promise<Provider<E>>
}

export class EventHandler<E extends Event> implements Handler<E> {
  private bookmark: string
  private stream: string
  private provider: Promise<Provider<E>>
  private position: any
  private running = false
  private handlers = new Map<E['type'], (id: string, ev: E, meta: EventMeta) => Promise<any>>()

  constructor(opts: Options<E>) {
    this.bookmark = opts.bookmark
    this.stream = opts.stream
    this.provider = Promise.resolve(opts.provider)
    this.run()
  }

  handle<T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>, meta: EventMeta) => Promise<void>
  ) {
    this.handlers.set(type, cb as any)
  }

  start() {
    this.running = true
  }

  stop() {
    this.running = false
  }

  reset() {
    this.position = undefined
  }

  async runOnce() {
    const provider = await this.provider
    if (!this.position) {
      this.position = await provider.getPosition(this.bookmark)
    }

    const events = await provider.getEventsFrom(this.stream, this.position)

    for (const event of events) {
      const handler = this.handlers.get(event.event.type)
      if (handler) {
        await handler(event.aggregateId, event.event, toMeta(event))
      }
      this.position = event.position
      await provider.setPosition(this.bookmark, this.position)
    }

    return events.length
  }

  async run() {
    if (!this.running) {
      setTimeout(this.run, POLL)
      return
    }

    try {
      const handled = await this.runOnce()
      setTimeout(this.run, handled === 0 ? POLL : 0)
    } catch (ex) {
      setTimeout(this.run, CRASH)
    }
  }
}

import { UserEvt, Provider, Ext } from './types'

const POLL = 1000
const CRASH = 10000

type Options<E extends UserEvt> = {
  stream: string
  bookmark: string
  provider: Provider<E>
}

export class Handler<E extends UserEvt> implements Handler<E> {
  private bookmark: string
  private stream: string
  private provider: Provider<E>
  private position: any
  private running = false
  private handlers = new Map<E['type'], (id: string, ev: E) => Promise<any>>()

  constructor(opts: Options<E>) {
    this.bookmark = opts.bookmark
    this.stream = opts.stream
    this.provider = opts.provider
  }

  handle<T extends E['type']>(
    type: T,
    cb: (aggregateId: string, event: Ext<E, T>) => Promise<void>
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
    if (!this.position) {
      this.position = await this.provider.getPosition(this.bookmark)
    }

    const events = await this.provider.getEventsFrom(this.stream, this.position)

    for (const event of events) {
      const handler = this.handlers.get(event.event.type)
      if (handler) {
        await handler(event.aggregateId, event.event)
      }
      this.position = event.position
      await this.provider.setPosition(this.bookmark, this.position)
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

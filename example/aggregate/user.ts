import { createAggregate } from '../../src/create-aggregate'
import { UserAgg, UserEvt } from '../types/user'
/**
 * 'user-events' is the "event stream" within the event log
 */
export const user = createAggregate<UserEvt, UserAgg, 'user-events'>({
  stream: 'user-events',
  create: () => ({ enabled: false, name: '' }),
  fold: (evt) => {
    switch (evt.type) {
      case 'created':
        return { name: evt.name, enabled: true }
      case 'enabled':
        return { enabled: true }
      case 'disabled':
        return { enabled: false }
      case 'nameChanged':
        return { name: evt.name }
    }
  },
})

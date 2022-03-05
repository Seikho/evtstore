import { createCommands } from '../../src/create-command'
import { domain } from '../domain'
import { UserAgg, UserCmd, UserEvt } from '../types/user'

export const userCmd = createCommands<UserEvt, UserAgg, UserCmd>(domain.user, {
  create: async (cmd, agg) => {
    if (agg.version > 0) throw new Error('User already exists')
    return { type: 'created', name: cmd.name }
  },
  disable: async (_cmd, agg) => {
    if (!agg.enabled) return
    return { type: 'disabled' }
  },
  enable: async (_cmd, agg) => {
    if (agg.enabled) return
    return { type: 'enabled' }
  },
  setName: async (cmd, agg) => {
    if (cmd.name === agg.name) return
    return { type: 'nameChanged', name: cmd.name }
  },
})

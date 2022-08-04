import { createProvider } from '../provider/memory'
import { createDomainV2 } from '../src/domain-v2'
import { user } from './aggregate/user'

export const provider = createProvider<any>()
export const { domain, createHandler } = createDomainV2({ provider }, { user })

const userProfiles = createHandler('user-profiles', ['user-events'], {
  alwaysTailStream: false,
  continueOnError: false,
  tailStream: false,
})

userProfiles.handle('user-events', 'created', async (id, ev, meta) => {
  // Create a profile in your database
})

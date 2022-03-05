import { createProvider } from '../provider/memory'
import { createDomainV2 } from '../src/domain-v2'
import { user } from './aggregate/user'

export const provider = createProvider<any>()
export const { domain, createHandler } = createDomainV2({ provider }, { user })

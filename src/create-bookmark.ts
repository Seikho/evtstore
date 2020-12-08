import { Event, Provider, ProviderBookmark } from './types'

export function createBookmark<E extends Event>(
  provider: Provider<E>,
  bookmark: string
): ProviderBookmark {
  return {
    name: bookmark,
    getPosition: () => provider.getPosition(bookmark),
    setPosition: (position: any) => provider.setPosition(bookmark, position),
  }
}

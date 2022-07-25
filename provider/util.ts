export function toArray(stream: string | string[]) {
  if (Array.isArray(stream)) return stream
  return [stream]
}

export function isPositionZero(position: any) {
  if (typeof position === 'number') return position === 0
  return position.high === 1 && position.low === 0
}

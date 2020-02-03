export function toArray(stream: string | string[]) {
  if (Array.isArray(stream)) return stream
  return [stream]
}

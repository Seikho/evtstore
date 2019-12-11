export class CommandError extends Error {
  constructor(public msg: string, public code?: string) {
    super(msg)
  }
}

export class VersionError extends CommandError {
  constructor(msg?: string) {
    const suffix = msg ? `: ${msg}` : ''
    super(`Version conflict error${suffix}`, 'VERSION_CONFLICT')
  }
}

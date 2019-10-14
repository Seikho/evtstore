export class CommandError extends Error {
  constructor(public msg: string, public code?: string) {
    super(msg)
  }
}

export class VersionError extends CommandError {
  constructor() {
    super('Version conflict error', 'VERSION_CONFLICT')
  }
}

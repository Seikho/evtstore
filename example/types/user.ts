export type UserAgg = { enabled: boolean; name: string }

export type UserEvt =
  | { type: 'disabled' }
  | { type: 'enabled' }
  | { type: 'nameChanged'; name: string }
  | { type: 'created'; name: string }

export type UserCmd =
  | { type: 'disable' }
  | { type: 'enable' }
  | { type: 'setName'; name: string }
  | { type: 'create'; name: string }

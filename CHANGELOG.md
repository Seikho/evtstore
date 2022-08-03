# Changelog

## 11.8.0

Add support for postgres.js library

- `import { migrate, createProvider } from 'evtstore/providers/postgres`

## 11.7.0

- Add `continueOnError` to Event Handler options
  - Do not stop processing events if an event handler throws. The error will be passed to `Provider.onError` and the event handler will move on to the next event(s)

## 11.6.1

- Added changelog :)
- Add `tailStream` and `alwaysTailStream` options when creating event handlers:
  - `tailStream`: When first starting, the handler will begin at the end of the stream(s) history
  - `alwaysTailStream`: When starting, the handler will _ALWAYS_ begin at the end of the stream(s) history

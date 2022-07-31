# Changelog

## 11.6.1

- Added changelog :)
- Add `tailStream` and `alwaysTailStream` options when creating event handlers:
  - `tailStream`: When first starting, the handler will begin at the end of the stream(s) history
  - `alwaysTailStream`: When starting, the handler will _ALWAYS_ begin at the end of the stream(s) history

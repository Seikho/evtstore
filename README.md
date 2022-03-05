# EvtStore

> Type-safe Event Sourcing and CQRS with Node.JS and TypeScript

- [Documentation](https://seikho.github.io/evtstore)
- [Supported Databases](https://seikho.github.io/evtstore/#/docs/providers)
- [API](https://seikho.github.io/evtstore/#/docs/api)
- [Event Handlers](https://seikho.github.io/evtstore/#/docs/event-handlers)
- [Command Handlers](https://seikho.github.io/evtstore/#/docs/commands)

**Note: `createDomain` will be migrating to `createDomainV2` in version 11.x**
The `createDomainV2` API solves circular reference issues when importing aggregates.
The original `createDomain` will be available as `createDomainV1` from 11.x onwards.

## Why

I reguarly use event sourcing and wanted to lower the barrier for entry and increase productivity for colleagues.  
The design goals were:

- Provide as much type safety and inference as possible
- Make creating domains quick and intuitive
- Be easy to test
- Allow developers to focus on application/business problems instead of Event Sourcing and CQRS problems

To obtain these goals the design is highly opinionated, but still flexible.

## Examples

EvtStore is type-driven to take advantage of type safety and auto completion. We front-load the creation of our `Event`, `Aggregate`, and `Command` types to avoid having to repeatedly import and pass them as generic argument. EvtStore makes use for TypeScript's [mapped types and conditional types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html) to achieve this.

See [the example folder](https://github.com/Seikho/evtstore/tree/master/example)

## Supported Databases

See [Providers](https://seikho.github.io/evtstore/#/docs/providers) for more details and examples

- Postgres using [node-postgres](https://node-postgres.com)
- SQLite, MySQL, Postgres using [Knex](https://knexjs.org)
- In-memory
- MongoDB
- Neo4j v3.5
- Neo4j v4

## API

See [API](https://seikho.github.com/evtstore/#/docs/api)

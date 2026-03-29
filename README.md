# Kavri

Kavri is a TypeScript IoC framework centered on explicit `inject(...)` dependency wiring (no `reflect-metadata` requirement).

It has two layers:

1. **Core IoC container** — usable standalone for CLI jobs, workers, tests, scripts, and libraries.
2. **Optional HTTP framework** — built on top of Kavri core (no dependency on Express/Fastify/Koa).

> If you only need dependency injection, use the core layer directly.

## Documentation

Design docs are modularized under [`docs/`](./docs):

- [Architecture Overview](./docs/01-architecture-overview.md)
- [IoC Container API](./docs/02-ioc-container.md)
- [HTTP Framework Layer](./docs/03-http-framework.md)
- [Configuration Module](./docs/04-configuration.md)
- [Dynamic Provider Registry](./docs/05-dynamic-providers.md)
- [Quick Start & Entry Patterns](./docs/06-quick-start.md)
- [Cookbook / End-to-End Examples](./docs/07-cookbook.md)

## Project Status

This repository currently contains design documentation. API names and package boundaries are still being finalized.

# Kavri

Kavri is a TypeScript IoC framework centered on explicit `inject(...)` dependency wiring (no `reflect-metadata` requirement).

It has two layers:

1. **Core IoC container** — usable standalone for CLI jobs, workers, tests, scripts, and libraries.
2. **Optional HTTP framework** — built on top of Kavri core (no dependency on Express/Fastify/Koa).

> If you only need dependency injection, use the core layer directly.

## Documentation

Design docs are organized as:

- [Overview](./docs/overview.md)
- [IoC Core](./docs/ioc.md)
- [Configuration](./docs/config.md)
- [Moduleization](./docs/moduleize.md)
- [HTTP Layer](./docs/http.md)

## Project Status

This repository currently contains design documentation. API names and package boundaries are still being finalized.

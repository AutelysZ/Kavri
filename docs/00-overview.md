# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring with optional upper-layer integrations.

## Priorities

1. Explicit graph (no reflection requirement)
2. Robust provider model (component, token, selector, registry)
3. Simple startup path with optional modularization
4. Config as first-class runtime input (via dedicated config layer)
5. Optional HTTP upper layer on top of IoC

## Document map

- [`01-ioc-core-design.md`](./01-ioc-core-design.md)
- [`02-modularization-design.md`](./02-modularization-design.md)
- [`03-configuration-design.md`](./03-configuration-design.md)
- [`04-http-layer-design.md`](./04-http-layer-design.md)

Current focus: **IoC completeness and implementation-ready API definition**.

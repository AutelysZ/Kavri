# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring and config-aware provider selection.

## Priorities

1. Explicit graph (no reflection requirement)
2. Robust provider model (component, token, selector, registry)
3. Config as first-class runtime input
4. Simple startup path with optional modularization
5. Optional HTTP upper layer on top of IoC

## Document map

- [`02-ioc-core-design.md`](./02-ioc-core-design.md)
- [`03-configuration-design.md`](./03-configuration-design.md)
- [`04-modularization-design.md`](./04-modularization-design.md)
- [`05-http-layer-design.md`](./05-http-layer-design.md)

Current focus: **IoC completeness and implementation-ready API definition**.

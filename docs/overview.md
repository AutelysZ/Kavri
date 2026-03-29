# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring and config-aware provider selection.

## Priorities

1. Explicit graph (no reflection requirement)
2. Robust provider model (component, token, selector, registry)
3. Config as first-class runtime input
4. Simple startup path with optional modularization
5. Optional HTTP upper layer on top of IoC

## Document map

- [`ioc-core-design.md`](./ioc-core-design.md)
- [`configuration-design.md`](./configuration-design.md)
- [`modularization-design.md`](./modularization-design.md)
- [`http-layer-design.md`](./http-layer-design.md)

Current focus: **IoC completeness and implementation-ready API definition**.

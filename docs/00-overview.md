# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring with optional upper-layer integrations. No reflect-metadata dependency — supports both TC39 and TypeScript decorators.

## Design principles

1. **Explicit graph** — no reflection. Dependencies declared via `inject()` in constructor default parameters.
2. **Strict inject points** — `inject()` only works in a well-defined set of contexts (constructors, factories, conditions). No ambient service locator.
3. **Suspense-style async** — async providers are handled transparently via a throw-and-retry mechanism. All `inject()` calls remain synchronous.
4. **Robust provider model** — `@Component`, `token()`, `computed()`, `@Provide` cover all injection patterns.
5. **Simple module system** — modules are `@Component()` classes with `@Provide` methods. `@Import`/`@Use` decorators for composition. No module hierarchy. `@Provide` works in any `@Component`.
6. **Config as first-class input** — `@Configuration` classes and zod schemas drive provider selection, conditional components, and runtime behavior.
7. **Event pub/sub** — `@EventData`/`@EventListener` for decoupled communication between components.
8. **Optional HTTP upper layer** — built on IoC core but not required.

## Document map

| Document | Scope |
|---|---|
| [`01-ioc-core-design.md`](./01-ioc-core-design.md) | Core types, `@Component`, lifecycle, providers, injection APIs, events, container, scopes |
| [`02-modularization-design.md`](./02-modularization-design.md) | `@Import`, `@Use`, module classes, composition patterns |
| [`03-configuration-design.md`](./03-configuration-design.md) | `@Configuration`, `createConfigSchema`, `injectConfig`, sources, precedence |
| [`04-http-layer-design.md`](./04-http-layer-design.md) | Optional HTTP layer: controllers, request scoping, middleware |
| [`draft.ts`](./draft.ts) | Complete API declarations with comprehensive usage examples |

## Current focus

API design finalization for core, modularization, and configuration modules. The `draft.ts` file is the authoritative API reference — design documents align with it.

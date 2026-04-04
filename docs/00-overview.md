# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring with optional upper-layer integrations. No reflect-metadata dependency — supports both TC39 and TypeScript decorators.

## Design principles

1. **Explicit graph** — no reflection. Dependencies declared via `inject()` in constructor default parameters.
2. **Strict inject points** — `inject()` only works in a well-defined set of contexts (constructors, factories, conditions). No ambient service locator.
3. **Suspense-style async** — async providers are handled transparently via a throw-and-retry mechanism. All `inject()` calls remain synchronous.
4. **Robust provider model** — `@Component`, `token()`, `computed()`, `@Provide`, `@Decorate` cover all injection patterns.
5. **Simple module system** — modules are `@Component()` classes with `@Provide`/`@Decorate`/`@Touch`/`@Use` decorators. No module hierarchy.
6. **Config as first-class input** — zod schemas drive provider selection, conditional components, and runtime behavior.
7. **Event pub/sub** — `@Event`/`@OnEvent`/`defineEvent` for decoupled communication between components.
8. **Metadata system** — `defineMetadata()` for custom decorator metadata without reflect-metadata.
9. **Optional HTTP upper layer** — built on IoC core but not required.

## Document map

| Document | Scope |
|---|---|
| [`01-ioc-core-design.md`](./01-ioc-core-design.md) | Core types, `@Component`, lifecycle, providers, injection APIs, metadata, container, scopes |
| [`02-modularization-design.md`](./02-modularization-design.md) | `@Touch`, `@Use`, `@Provide`, `@Decorate`, module composition |
| [`03-configuration-design.md`](./03-configuration-design.md) | `createConfigSchema`, `injectConfig`, `ConfigOptions`, sources, precedence |
| [`04-event-design.md`](./04-event-design.md) | `@Event`, `@OnEvent`, `defineEvent`, `EventBus` |
| [`05-http-layer-design.md`](./05-http-layer-design.md) | Optional HTTP layer: controllers, request scoping, middleware |
| [`06-eslint-plugin-design.md`](./06-eslint-plugin-design.md) | ESLint rules: `inject-context`, `no-inject-after-side-effect` |
| [`draft.ts`](./draft.ts) | Complete API declarations with comprehensive usage examples |

## Current focus

API design finalization for core, modularization, and configuration modules. The `draft.ts` file is the authoritative API reference.

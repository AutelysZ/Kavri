# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring with optional upper-layer integrations. No reflect-metadata dependency — supports both TC39 and TypeScript decorators.

## Design principles

1. **Explicit graph** — no reflection. Dependencies declared via `inject()` in constructor default parameters.
2. **Strict inject points** — `inject()` only works in well-defined contexts. No ambient service locator.
3. **Suspense-style async** — async providers handled transparently via throw-and-retry. `inject()` stays synchronous.
4. **Unified metadata** — all decorators carry typed metadata via `createClassDecorator`/`createMethodDecorator`. `Metadata.of()` reads any decorator's data.
5. **Config is injection** — configuration schemas produce tokens, injected with `inject()` like any other dependency.
6. **Simple modules** — `@Component()` classes with `@Provide`/`@Touch`/`@Use` decorators. No module hierarchy.
7. **Event pub/sub** — `@EventType`/`@OnEvent`/`defineEvent` for decoupled communication.
8. **Optional HTTP upper layer** — built on IoC core but not required.

## Document map

| Document | Scope |
|---|---|
| [`01-ioc-core-design.md`](./01-ioc-core-design.md) | Components, providers, injection, container, scopes |
| [`02-modularization-design.md`](./02-modularization-design.md) | @Touch, @Use, @Provide, @ConfigDefault, module composition |
| [`03-configuration-design.md`](./03-configuration-design.md) | createConfigSchema, ConfigOptions, sources, precedence |
| [`04-event-design.md`](./04-event-design.md) | @EventType, @OnEvent, defineEvent, EventBus |
| [`05-metadata-design.md`](./05-metadata-design.md) | Metadata.of, createClassDecorator, createMethodDecorator |
| [`07-http-layer-design.md`](./07-http-layer-design.md) | Controllers, request scoping, middleware |
| [`08-eslint-plugin-design.md`](./08-eslint-plugin-design.md) | ESLint rules for inject-point enforcement |
| [`draft.ts`](./draft.ts) | Complete API declarations with usage examples |

## Current focus

API design finalization for core, modularization, and configuration. The `draft.ts` file is the authoritative API reference.

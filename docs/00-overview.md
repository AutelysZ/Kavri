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
8. **Class-based schemas** — `@Schema` + field decorators replace Zod. Full JSON Schema coverage, no `z.infer<>`.
9. **Optional HTTP upper layer** — built on IoC core but not required.

## Package structure

```
@kavri/basic   → Metadata, createClassDecorator, createFieldDecorator, helpers
@kavri/schema  → Schema, field decorators, parse, validate, toJsonSchema (no @kavri/core dependency)
@kavri/core    → Component, Container, inject, Token, etc.
@kavri/event   → EventType, EventBus, OnEvent, defineEvent
@kavri/config  → createConfiguration, Loader, Resolver, BootstrapOptions
@kavri/web     → Controller, Interceptor, WebApplication, RequestContext, injectClient
@kavri/client  → createClient, typed HTTP clients from service definitions
@kavri/eslint-plugin → ESLint rules for inject-point enforcement
@kavri/aws-secretmanager-resolver → AWS Secrets Manager Resolver for @kavri/config
@kavri/drizzle → Drizzle ORM integration, TransactionInterceptor, Repository base
```

## Document map

| Document | Scope |
|---|---|
| [`01-ioc-core-design.md`](./01-ioc-core-design.md) | Components, providers, injection, container |
| [`02-modularization-design.md`](./02-modularization-design.md) | @Touch, @Use, @Provide, module composition |
| [`03-configuration-design.md`](./03-configuration-design.md) | createConfiguration, BootstrapOptions, sources, precedence |
| [`04-event-design.md`](./04-event-design.md) | @EventType, @OnEvent, defineEvent, EventBus |
| [`05-metadata-design.md`](./05-metadata-design.md) | Metadata.of, createClassDecorator, createMethodDecorator |
| [`06-http-layer-design.md`](./06-http-layer-design.md) | Controllers, interceptors, service definitions, WebApplication |
| [`08-eslint-plugin-design.md`](./08-eslint-plugin-design.md) | ESLint rules for inject-point enforcement |
| [`09-schema-design.md`](./09-schema-design.md) | @Schema, field decorators, parse, validate, toJsonSchema |
| [`draft.ts`](./draft.ts) | Complete API declarations with usage examples |

## Current focus

API design finalization for core, modularization, configuration, and schema modules. The `draft.ts` file is the authoritative API reference for core/config.

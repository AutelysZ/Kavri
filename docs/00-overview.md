# Overview

Kavri is a TypeScript IoC framework focused on explicit dependency wiring with optional upper-layer integrations. No reflect-metadata dependency — supports both TC39 and TypeScript decorators.

## Design principles

1. **Explicit graph** — no reflection. Dependencies declared via `inject()` in constructor default parameters.
2. **Strict inject points** — `inject()` only works in well-defined contexts. No ambient service locator.
3. **Suspense-style async** — async providers handled transparently via throw-and-retry. `inject()` stays synchronous.
4. **Unified metadata** — all decorators carry typed metadata via `createClassDecorator`/`createMethodDecorator`. `Metadata.of()` reads any decorator's data.
5. **Config is injection** — `@Configuration` class decorator composes `@Schema`. Inject with `injectConfig()`. No separate parser or token creation step.
6. **Simple modules** — `@Component()` classes with `@Provide`/`@Touch`/`@Use` decorators. No module hierarchy.
7. **Event pub/sub** — `@EventType`/`@OnEvent`/`defineEvent` for decoupled communication.
8. **Class-based schemas** — `@Schema` + field decorators replace Zod. Full JSON Schema coverage, no `z.infer<>`.
9. **Optional web module** — `@kavri/web`, built on IoC core but not required.

## Package structure

```
@kavri/basic   → Metadata, createClassDecorator, createFieldDecorator, helpers
@kavri/schema  → Schema, field decorators, parse, validate, toJsonSchema (no @kavri/container dependency)
@kavri/container    → Component, Container, inject, Token, etc.
@kavri/event   → EventType, EventBus, OnEvent, defineEvent
@kavri/config  → @Configuration, injectConfig, OverrideConfiguration, Loader, Resolver, ConfigFileOptions, ProfileOptions, VariantOptions
@kavri/logging  → Logger, RawLogger, injectLogger, LoggingProvider, LoggingInterceptor, LoggingOptions
@kavri/web     → Controller, createController, Interceptor, WebApplication, RequestContext, Key
@kavri/client  → createClient, injectClient, typed HTTP clients from service definitions
@kavri/eslint-plugin → ESLint rules for inject-point enforcement
@kavri/aws-secretmanager-resolver → AWS Secrets Manager Resolver for @kavri/config
@kavri/drizzle → Drizzle ORM integration, TransactionInterceptor, Repository base
```

## Document map

| Document | Scope |
|---|---|
| [`01-ioc-core-design.md`](./01-ioc-core-design.md) | Components, providers, injection, container |
| [`02-modularization-design.md`](./02-modularization-design.md) | @Touch, @Use, @Provide, module composition |
| [`03-configuration-design.md`](./03-configuration-design.md) | @Configuration, injectConfig, ConfigFileOptions, ProfileOptions, VariantOptions, sources, precedence |
| [`04-event-design.md`](./04-event-design.md) | @EventType, @OnEvent, defineEvent, EventBus |
| [`05-metadata-design.md`](./05-metadata-design.md) | Metadata.of, createClassDecorator, createMethodDecorator |
| [`06-web-design.md`](./06-web-design.md) | Controller, createController, interceptors, WebApplication |
| [`08-eslint-plugin-design.md`](./08-eslint-plugin-design.md) | ESLint rules for inject-point enforcement |
| [`09-schema-design.md`](./09-schema-design.md) | @Schema, field decorators, defineRoute, parse, toJsonSchema |
| [`10-logging-design.md`](./10-logging-design.md) | Logger, injectLogger, LogConfiguration |
| [`draft.ts`](./draft.ts) | Complete API declarations with usage examples |

## Current focus

API design finalization for core, modularization, configuration, and schema modules. The `draft.ts` file is the authoritative API reference for core/config.

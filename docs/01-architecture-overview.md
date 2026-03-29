# 01. Architecture Overview

## Goals

Kavri should be:

- **Explicit**: dependencies are declared via `inject(...)`, never hidden behind reflection.
- **Layered**: core IoC is independent; HTTP is optional and built on top.
- **Modular**: features are split into packages/modules, not forced monolith.
- **Ergonomic**: simple entry path for small apps, scalable for large apps.
- **Deterministic**: strict lifecycle and scope behavior.

## Layers

### Layer A — Core IoC (required)

Scope:

- provider system (component, token, conditional/collection/registry)
- token system
- providers and resolution
- scopes (singleton/scoped/transient)
- lifecycle hooks
- module composition
- diagnostics

No HTTP concerns in this layer.

### Layer B — Configuration (optional, but first-class)

Scope:

- config source loading (CLI, env, files)
- schema validation (class-validator and zod style)
- typed access APIs
- profile-based config

This layer depends on Core IoC and is intended to feel as feature-rich as Spring Boot config experience.

### Layer C — HTTP Framework (optional)

Scope:

- routing, middleware, controllers
- request scope integration with IoC
- server adapter written by Kavri itself

It must not depend on Express/Fastify/Koa.

## Package suggestion

- `@kavri/core` — IoC container
- `@kavri/config` — config system
- `@kavri/http` — HTTP server framework
- `@kavri/testing` — test helpers

## Composition model

```ts
import { Container } from '@kavri/core';
import { ConfigModule } from '@kavri/config';
import { HttpModule } from '@kavri/http';

const app = new Container()
  .use(ConfigModule.from({ files: ['app.yaml'] }))
  .use(HttpModule.forRoot({ port: 3000 }));

await app.resolve(AppBootstrap);
```

## Design constraints

1. Core APIs must remain usable without decorators.
2. Framework-level APIs should compile in ESM-first environments.
3. No hidden auto-registration through directory scanning.
4. Startup should fail fast for invalid configs or unresolved providers.

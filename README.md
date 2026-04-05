# Kavri

**TypeScript IoC that doesn't need reflect-metadata.**

Kavri uses default parameters as the injection mechanism. No reflection, no parameter decorators, no `emitDecoratorMetadata`. Works with both TC39 and TypeScript decorators.

```ts
@Component()
class OrderService {
    constructor(
        private readonly db = inject(Database),
        private readonly config = inject(AppConfig),
        private readonly cache = inject(Redis, true),  // optional
    ) {}
}
```

## What's different

**Default parameters are the DI wire.** Every other TypeScript DI framework needs reflect-metadata or explicit parameter decorators. Kavri doesn't — constructor defaults are the injection points, and the container evaluates them in a controlled context.

**Async is transparent.** Async providers (`@OnConstruct`, async token factories) work via a Suspense-style throw-and-retry. `inject()` is always synchronous. No `injectAsync`, no `Promise<T>` wrappers, no two-phase init.

**All decorators are metadata.** Every decorator — built-in or custom — carries typed metadata readable via `Metadata.of()`. No reflect-metadata, no `Map<string, any>` side channels.

```ts
// Create a custom decorator with one line
function Cacheable(opts: { ttl: number }): ClassDecorator<{ ttl: number }> {
    return createClassDecorator(Cacheable, opts);
}

@Cacheable({ ttl: 3600 })
class UserService {}

Metadata.of(Cacheable, UserService); // [{ ttl: 3600 }]
```

**Config is just injection.** Configuration schemas produce tokens — injected with the same `inject()` as any other dependency. No special config API.

```ts
const DbConfig = createConfigSchema('database', z.object({
    driver: z.string(),
    host: z.string(),
    port: z.number().default(5432),
}));

@Component()
class Repo {
    constructor(private readonly config = inject(DbConfig)) {}
}
```

## Minimal example

```ts
import { Container, Component, Provide, Use, inject, token } from 'kavri';
import { createConfigSchema, ConfigOptions } from 'kavri/config';
import { z } from 'zod';

const AppConfig = createConfigSchema('app', z.object({
    greeting: z.string().default('Hello'),
}));

@Component()
class Greeter {
    constructor(private readonly config = inject(AppConfig)) {}
    greet(name: string) { return `${this.config.greeting}, ${name}!`; }
}

const container = new Container();
container.decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['app.yaml'],
}));

const greeter = await container.resolve(Greeter);
console.log(greeter.greet('world')); // Hello, world!
await container.destroy();
```

## Documentation

- [IoC Core](./docs/01-ioc-core-design.md) — components, providers, injection, scopes
- [Modules](./docs/02-modularization-design.md) — @Touch, @Use, @Provide, @Decorate
- [Configuration](./docs/03-configuration-design.md) — zod schemas, multi-source config
- [Events](./docs/04-event-design.md) — @EventType, @OnEvent, EventBus
- [Metadata](./docs/05-metadata-design.md) — Metadata.of, createClassDecorator
- [API Reference](./docs/draft.ts) — complete type declarations with examples

## Status

Design phase. API surface is defined. Implementation is next.

## License

[MIT](./LICENSE)

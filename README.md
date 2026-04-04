# Kavri

**Explicit, type-safe IoC for TypeScript. No reflect-metadata. No magic.**

Kavri is a dependency injection framework that uses default parameter injection to wire dependencies — no reflection, no parameter decorators, no emit-decorator-metadata. It works with both TC39 Stage 3 decorators and TypeScript experimental decorators out of the box.

```ts
@Component()
class UserService {
    constructor(
        private readonly db = inject(Database),
        private readonly logger = inject(Logger),
    ) {}
}
```

## Why Kavri

| | Kavri | InversifyJS / TSyringe | NestJS | Awilix |
|---|---|---|---|---|
| reflect-metadata | Not needed | Required | Required | Not needed |
| TC39 decorators | Yes | No | No | N/A |
| Injection style | Default params | Param decorators | Param decorators | Proxy / manual |
| Async providers | Suspense-style | Manual | Manual | Manual |

### The default-parameter pattern

Dependencies are declared as constructor default values. The container evaluates them in an inject context — no metadata reflection, no special compiler flags, no runtime type information.

```ts
@Component({ name: 'psql' })
class PsqlDriver extends Driver {
    async query(sql: string) { return `psql:${sql}`; }
}

// Select driver based on config at runtime
const SelectedDriver = computed<Driver>(
    (config = injectConfig(DbConfig), driver = inject(Driver, config.driver)) => driver
);

@Component()
class Repository {
    constructor(private readonly driver = inject(SelectedDriver)) {}
}
```

### Strict inject points

`inject()` only works inside a well-defined set of contexts — constructor defaults, token factories, computed resolvers, and condition functions. Calling it anywhere else is a runtime error. This prevents the service-locator anti-pattern by design, not convention.

### Suspense-style async

Async providers (`@OnConstruct`, async token factories) are handled transparently. `inject()` stays synchronous — if a dependency isn't ready, the container interrupts the factory with a thrown Promise, awaits it, and retries. No split between sync and async injection APIs.

## Core Concepts

### Components

```ts
@Component()
class UserService {
    constructor(private readonly repo = inject(UserRepository)) {}
}

// Named components for strategy patterns
@Component({ name: 'json' })
class JsonSerializer extends Serializer { ... }

@Component({ name: 'xml' })
class XmlSerializer extends Serializer { ... }
```

### Tokens and Computed

```ts
// Token: a typed, named injectable for non-class values
const DbUrl = token<string>(
    (config = injectConfig(DbConfig)) => config.url
);

// Computed: dynamic provider selection
const SelectedDriver = computed<Driver>(
    (config = injectConfig(DbConfig), d = inject(Driver, config.driver)) => d
);
```

### Injection

```ts
@Component()
class App {
    constructor(
        private readonly db = inject(Database),              // required
        private readonly cache = inject(Cache, true),        // optional
        private readonly driver = inject(Driver, 'psql'),    // named
        private readonly all = injectAll(Plugin, 'alphabetical'), // collection
        private readonly map = injectMap(Serializer),        // as Map
        private readonly ref = injectRef(CircularDep),       // lazy ref
    ) {}
}
```

### Modules

Modules are `@Component()` classes with `@Provide`, `@Decorate`, `@Touch`, and `@Use` decorators. Every decorator has a matching `container.*()` method.

```ts
@Component()
@Provide(Redis, async (config = injectConfig(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, { onDestroy: 'disconnect' })
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml'],
}))
@Touch(PsqlDriver, MysqlDriver)
class AppModule {}
```

| Decorator | Container method | Purpose |
|---|---|---|
| `@Touch(X)` | `container.touch(X)` | Register without instantiating |
| `@Use(X)` | `container.use(X)` | Instantiate and process decorators |
| `@Provide(X, fn)` | `container.provide(X, fn)` | Register a provider |
| `@Decorate(X, fn)` | `container.decorate(X, fn)` | Wrap an existing provider |

### Configuration

Zod-powered, first-class config with multi-source precedence.

```ts
const DbConfig = createConfigSchema('database', z.object({
    driver: z.string(),
    host: z.string(),
    port: z.number().default(5432),
    username: z.string(),
    password: z.string(),
}));

@Component()
class DatabaseService {
    constructor(private readonly config = injectConfig(DbConfig)) {}
}
```

Source precedence: runtime overrides > CLI args > env vars > config files > schema defaults.

### Events

```ts
@Event('order.created')
class OrderCreatedEvent {
    constructor(public readonly orderId: string) {}
}

const CacheInvalidated = defineEvent<{ key: string }>('cache.invalidated');

@Component()
class OrderListener {
    @OnEvent(OrderCreatedEvent)
    async onCreated(ev: OrderCreatedEvent) { ... }

    @OnEvent(CacheInvalidated)
    onCacheCleared(data: { key: string }) { ... }
}
```

### Metadata

General-purpose metadata system that replaces reflect-metadata for custom decorators.

```ts
const Cacheable = defineMetadata<{ ttl: number }>('cacheable');

@Component()
@Cacheable({ ttl: 3600 })
class UserService { ... }

Cacheable.of(UserService); // { ttl: 3600 }
```

### Lifecycle

```ts
@Component()
class ConnectionPool {
    @OnConstruct()
    async init() { /* async setup after construction */ }

    @OnDestroy()
    async drain() { /* cleanup on container destroy */ }
}
```

## Quick Start

```ts
import { Container, Component, Provide, Touch, Use, inject, computed, token } from 'kavri';
import { createConfigSchema, ConfigOptions, injectConfig } from 'kavri/config';
import { z } from 'zod';

// Define config
const AppConfig = createConfigSchema('app', z.object({
    greeting: z.string().default('Hello'),
}));

// Define components
@Component()
class Greeter {
    constructor(private readonly config = injectConfig(AppConfig)) {}
    greet(name: string) { return `${this.config.greeting}, ${name}!`; }
}

// Bootstrap
const container = new Container();
container.decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['app.yaml'],
}));

const greeter = await container.resolve(Greeter);
console.log(greeter.greet('world')); // Hello, world!

await container.destroy();
```

## Architecture

```
kavri/            Core IoC — components, tokens, computed, injection, container, metadata
kavri/config      Configuration — zod schemas, multi-source loading, injectConfig
kavri/event       Event system — @Event, @OnEvent, defineEvent, EventBus
kavri/http        (Optional) HTTP framework — controllers, request scoping, middleware
```

The core module has zero framework-level dependencies. Config, events, and HTTP are optional layers built on top.

## Documentation

| Document | Description |
|---|---|
| [Overview](./docs/00-overview.md) | Design principles and document map |
| [IoC Core](./docs/01-ioc-core-design.md) | Components, providers, injection, container, scopes, metadata |
| [Modularization](./docs/02-modularization-design.md) | @Touch, @Use, @Provide, @Decorate, module composition |
| [Configuration](./docs/03-configuration-design.md) | Zod schemas, config sources, precedence, validation |
| [Events](./docs/04-event-design.md) | @Event, @OnEvent, EventBus, defineEvent |
| [HTTP Layer](./docs/05-http-layer-design.md) | Controllers, request scoping, middleware |
| [API Reference](./docs/draft.ts) | Complete type declarations with usage examples |

## Status

Kavri is in the **design phase**. The API surface is defined and documented. Implementation is next. API names may evolve during implementation.

## License

[MIT](./LICENSE)

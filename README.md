# Kavri

**TypeScript IoC that doesn't need reflect-metadata.**

Kavri uses default parameters as the injection mechanism. No reflection, no parameter decorators, no `emitDecoratorMetadata`. Works with both TC39 and TypeScript decorators.

## What's different

**Default parameters are the DI wire.** Every other TypeScript DI framework needs reflect-metadata or explicit parameter decorators. Kavri doesn't — constructor defaults are the injection points, and the container evaluates them in a controlled context.

**Async is transparent.** Async providers (`@OnConstruct`, async token factories) work via a Suspense-style throw-and-retry. `inject()` is always synchronous. No `injectAsync`, no `Promise<T>` wrappers, no two-phase init.

**All decorators are metadata.** Every decorator — built-in or custom — carries typed metadata readable via `Metadata.of()`. No reflect-metadata, no `Map<string, any>` side channels.

**Config is just injection.** Configuration schemas produce tokens — injected with the same `inject()` as any other dependency. No special config API.

## Example

```ts
import { Container, Component, Provide, Decorate, Touch, Use, inject, computed, token } from 'kavri';
import { createConfigSchema, ConfigOptions } from 'kavri/config';
import { z } from 'zod';

// config
const DbConfig = createConfigSchema('database', z.object({
    driver: z.enum(['psql', 'mysql']),
    url: z.string(),
}));

// components
abstract class Driver {
    abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
    async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = computed<Driver>(
    (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d
);

// external class via @Provide
declare class Redis { connect(url: string): Promise<void>; disconnect(): Promise<void>; }

@Component()
@Provide(Redis, async () => { const r = new Redis(); await r.connect('redis://localhost'); return r; }, { onDestroy: 'disconnect' })
@Decorate(ConfigOptions, (prev) => ({ ...prev, configFiles: ['app.yaml'] }))
class AppModule {}

// application
@Component()
@Touch(PsqlDriver)
@Use(AppModule)
class App {
    constructor(
        private readonly driver = inject(SelectedDriver),
        private readonly redis = inject(Redis),
    ) {}

    async run() { console.log(await this.driver.query('select 1')); }
}

const container = new Container();
const app = await container.resolve(App);
await app.run();
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

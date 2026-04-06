# Kavri

**TypeScript IoC that doesn't need reflect-metadata.**

Kavri uses default parameters as the injection mechanism. No reflection, no parameter decorators, no `emitDecoratorMetadata`. Works with both TC39 and TypeScript decorators.

## What's different

**Default parameters are the DI wire.** Every other TypeScript DI framework needs reflect-metadata or explicit parameter decorators. Kavri doesn't — constructor defaults are the injection points, and the container evaluates them in a controlled context.

**Async is transparent.** Async providers (`@OnConstruct`, async token factories) work via a Suspense-style throw-and-retry. `inject()` is always synchronous. No `injectAsync`, no `Promise<T>` wrappers, no two-phase init.

**All decorators are metadata.** Every decorator — built-in or custom — carries typed metadata readable via `Metadata.of()`. No reflect-metadata, no `Map<string, any>` side channels.

**Config is just injection.** `@Configuration` class decorator composes `@Schema` — fields use schema decorators. Inject with `injectConfig()`. No separate parser or token creation step.

## Example

```ts
import { Container, Component, Conditional, Provide, OverrideConfiguration, Touch, Use, inject, token } from '@kavri/core';
import { Configuration, injectConfig, ConfigFileOptions } from '@kavri/config';
import { IsString, IsBoolean } from '@kavri/schema';

// config
@Configuration('database')
class DatabaseConfig {
    @IsString({ in: ['psql', 'mysql'] }) driver!: string;
    @IsString() url!: string;
}

@Configuration('telemetry')
class TelemetryConfig {
    @IsBoolean({ default: false }) enabled!: boolean;
}

// components
abstract class Driver {
    abstract query(sql: string): Promise<any>;
}

@Component('psql')
class PsqlDriver extends Driver {
    async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = token<Driver>(
    (cfg = injectConfig(DatabaseConfig), d = inject(Driver, cfg.driver)) => d
);

// conditional component
@Component()
@Conditional((config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false)
class TelemetryService {
    constructor(private readonly config = injectConfig(TelemetryConfig)) {}
    send(metric: string, value: number): void {}
}

// external class via @Provide
declare class Redis { connect(url: string): Promise<void>; disconnect(): Promise<void>; }

@Component()
@Provide(Redis, async () => { const r = new Redis(); await r.connect('redis://localhost'); return r; }, { onDestroy: 'disconnect' })
@OverrideConfiguration(ConfigFileOptions, () => ({ configFile: './config/app' }))
class AppModule {}

// application
@Component()
@Touch(PsqlDriver)
@Use(AppModule)
class App {
    constructor(
        private readonly driver = inject(SelectedDriver),
        private readonly redis = inject(Redis),
        private readonly telemetry = inject(TelemetryService, true),
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
- [Modules](./docs/02-modularization-design.md) — @Touch, @Use, @Provide, @OverrideConfiguration
- [Configuration](./docs/03-configuration-design.md) — @Configuration classes, multi-source config
- [Events](./docs/04-event-design.md) — @EventType, @OnEvent, EventBus
- [Metadata](./docs/05-metadata-design.md) — Metadata.of, createClassDecorator
- [API Reference](./docs/draft.ts) — complete type declarations with examples

## Status

Design phase. API surface is defined. Implementation is next.

## License

[MIT](./LICENSE)

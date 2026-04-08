# Modularization Design

## 1. Purpose

Modules group cohesive sets of providers and component registrations. A module is a `@Component()` class that uses `@Provide`, `@Touch`, `@Use`, and/or `@OverrideConfiguration` decorators.

There is no root/local module hierarchy. ESM already handles physical modularization. Kavri modules are purely logical groupings for provider organization.

## 2. Core APIs

### `@Touch(...injectables)` — register without instantiating

Ensures the listed injectables are **registered** when the decorated class is resolved. Like Unix `touch` — acknowledge existence, nothing more.

```ts
declare function Touch(...injectables: Injectable<any>[]): ClassDecorator;
```

Use for making implementations available for collection injection (`injectAll`/`injectMap`/`injectSet`). In ESM, classes that are never imported are invisible to the container — `@Touch` is how you declare "this implementation exists."

### `@Use(...injectables)` — instantiate and activate

Ensures the listed injectables are **instantiated** (and their `@Provide` decorators processed) before the decorated class is resolved.

```ts
declare function Use(...injectables: Injectable<any>[]): ClassDecorator;
```

Use for:
- Components with `@Provide` that must be processed
- Side-effect components (event subscribers, background workers)

### `@Provide` and `@OverrideConfiguration` on modules

Modules use `@Provide` as a class decorator to register providers, and `@OverrideConfiguration` to supply code-level defaults for config tokens:

```ts
@Component()
@Provide(Redis, async (config = injectConfig(RedisConfig)) => {
  const r = new Redis();
  await r.connect(config.url);
  return r;
}, { onDestroy: 'disconnect' })
@OverrideConfiguration(ConfigFileOptions, () => ({ configFile: './config/app' }))
class AppModule {}
```

`@Provide`/`@OverrideConfiguration` can be used on **any** `@Component()` class, not just dedicated module classes.

## 3. Touch vs Use

| | `@Touch` | `@Use` |
|---|---|---|
| **What it does** | Registers injectable (makes it known) | Instantiates injectable (triggers side effects) |
| **Processes `@Provide`?** | No | Yes |
| **When to use** | Implementations for collections | Modules, side-effect components |
| **Ordering guarantee** | No (just registration) | Yes (instantiated before dependant) |

## 4. Rules

- **Module is optional.** Small applications can put `@Provide`/`@OverrideConfiguration`/`@Touch` directly on the entrypoint class.
- **Module does not change resolution semantics.** Lifecycle and injection behavior are identical whether registered via a module or directly.
- **Modules can compose.** A module can `@Use` other modules.
- **No circular module dependencies.** If module A uses module B and B uses A, startup fails.
- **`@Touch` is additive.** Touching the same injectable multiple times is idempotent.
- **`@Use` guarantees ordering.** Components listed in `@Use` are instantiated before the decorated class.

## 5. Full example

```ts
import {
  Container,
  Component,
  Provide,
  Touch,
  Use,
  OnEvent,
  OnDestroy,
  EventType,
  EventBus,
  inject,
  injectAll,
  injectSet,
  injectMap,
  token,
} from '@kavri/container';
import { Configuration, injectConfig, OverrideConfiguration, ConfigFileOptions, VariantOptions } from '@kavri/config';
import { IsString } from '@kavri/schema';

// ---- driver module ----

@Configuration('database')
class DatabaseConfig {
  @IsString() driver!: string;
  @IsString() url!: string;
}

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component('psql')
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

@Component('mysql')
class MysqlDriver extends Driver {
  async query(sql: string) { return `mysql:${sql}`; }
}

const SelectedDriver = token<Driver>(
  (cfg = injectConfig(DatabaseConfig), d = inject(Driver, cfg.driver)) => d,
);

@Component()
@Touch(PsqlDriver, MysqlDriver)
class DriverModule {}

// ---- cache module ----

declare class Redis {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
}

const RedisUrl = token<string>(() => {
  throw new Error('RedisUrl must be provided');
});

@Component()
@Provide(Redis, async (url = inject(RedisUrl)) => {
  const r = new Redis();
  await r.connect(url);
  return r;
}, { onDestroy: 'disconnect' })
class CacheModule {}

// ---- config module ----

@Component()
@OverrideConfiguration(ConfigFileOptions, () => ({
  configFile: './config/app',
}))
@OverrideConfiguration(VariantOptions, () => ({
  envPrefix: 'MYAPP_',
}))
class ConfigModule {}

// ---- notification module (side-effect) ----

@EventType('user.registered')
class UserRegisteredEvent {
  constructor(public readonly email: string) {}
}

@Component()
class EmailNotifier {
  @OnEvent(UserRegisteredEvent)
  async onUserRegistered(ev: UserRegisteredEvent) {
    console.log(`welcome email sent to ${ev.email}`);
  }
}

// ---- user module ----

@Component()
class UserService {
  constructor(
    private readonly driver = inject(SelectedDriver),
    private readonly events = inject(EventBus),
  ) {}

  async register(email: string) {
    await this.driver.query(`insert into users ...`);
    await this.events.emit(new UserRegisteredEvent(email));
  }
}

// ---- application root ----

@Component()
class Application {
  constructor(
    private readonly users = inject(UserService),
    private readonly drivers = injectAll(Driver, 'alphabet'),
  ) {}

  async run() {
    console.log(`available drivers: ${this.drivers.length}`);
    await this.users.register('alice@example.com');
  }
}

// ---- bootstrap ----

@Component()
@Provide(RedisUrl, () => 'redis://localhost:6379')
@Use(ConfigModule, DriverModule, CacheModule)
@Use(EmailNotifier)
class Bootstrap {
  constructor(private readonly app = inject(Application)) {}
  async run() { return this.app.run(); }
}

const container = new Container();
const boot = await container.resolve(Bootstrap);
await boot.run();
await container.destroy();
```

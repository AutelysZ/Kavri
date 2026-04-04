# Modularization Design

## 1. Purpose

Modules group cohesive sets of providers and component registrations. A module is a `@Component()` class that uses `@Provide`, `@Decorate`, `@Touch`, and/or `@Use` decorators.

There is no root/local module hierarchy. ESM already handles physical modularization. Kavri modules are purely logical groupings for provider organization.

## 2. Core APIs

### `@Touch(...injectables)` — register without instantiating

Ensures the listed injectables are **registered** when the decorated class is resolved. Like Unix `touch` — acknowledge existence, nothing more.

```ts
declare function Touch(...injectables: Injectable<any>[]): ClassDecorator;
```

Use for making implementations available for collection injection (`injectAll`/`injectMap`/`injectSet`). In ESM, classes that are never imported are invisible to the container — `@Touch` is how you declare "this implementation exists."

### `@Use(...injectables)` — instantiate and activate

Ensures the listed injectables are **instantiated** (and their `@Provide`/`@Decorate` decorators processed) before the decorated class is resolved.

```ts
declare function Use(...injectables: Injectable<any>[]): ClassDecorator;
```

Use for:
- Components with `@Provide`/`@Decorate` that must be processed
- Side-effect components (event subscribers, background workers)

### Container equivalents

```ts
class Container {
  touch(...injectables: Injectable<any>[]): void;
  use(...injectables: Injectable<any>[]): void;
}
```

### `@Provide` and `@Decorate` on modules

Modules use `@Provide` and `@Decorate` as class decorators to register and wrap providers:

```ts
@Component()
@Provide(Redis, async (config = injectConfig(RedisConfig)) => {
  const r = new Redis();
  await r.connect(config.url);
  return r;
}, { onDestroy: 'disconnect' })
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['app.yaml'],
}))
class AppModule {}
```

`@Provide`/`@Decorate` can be used on **any** `@Component()` class, not just dedicated module classes.

## 3. Touch vs Use

| | `@Touch` / `container.touch()` | `@Use` / `container.use()` |
|---|---|---|
| **What it does** | Registers injectable (makes it known) | Instantiates injectable (triggers side effects) |
| **Processes `@Provide`/`@Decorate`?** | No | Yes |
| **When to use** | Implementations for collections | Modules, side-effect components |
| **Ordering guarantee** | No (just registration) | Yes (instantiated before dependant) |

## 4. Rules

- **Module is optional.** Small applications can use `container.provide()` and `container.touch()` directly.
- **Module does not change resolution semantics.** Provider scope, lifecycle, and injection behavior are identical whether registered via a module or directly.
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
  Decorate,
  Touch,
  Use,
  OnEvent,
  OnDestroy,
  Event,
  EventBus,
  inject,
  injectAll,
  token,
  computed,
} from 'kavri';
import { createConfigSchema, ConfigOptions, injectConfig } from 'kavri/config';
import { z } from 'zod';

// ---- driver module ----

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  url: z.string(),
}));

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

@Component({ name: 'mysql' })
class MysqlDriver extends Driver {
  async query(sql: string) { return `mysql:${sql}`; }
}

const SelectedDriver = computed<Driver>(
  (cfg = injectConfig(DbConfig), d = inject(Driver, cfg.driver)) => d,
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
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['application.yaml'],
}))
class ConfigModule {}

// ---- notification module (side-effect) ----

@Event('user.registered')
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

@Use(ConfigModule, DriverModule, CacheModule)
@Use(EmailNotifier)
class Application {
  constructor(
    private readonly users = inject(UserService),
    private readonly drivers = injectAll(Driver, 'alphabetical'),
  ) {}

  async run() {
    console.log(`available drivers: ${this.drivers.length}`);
    await this.users.register('alice@example.com');
  }
}

// ---- bootstrap ----

const container = new Container();
container.provide(RedisUrl, () => 'redis://localhost:6379');

const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

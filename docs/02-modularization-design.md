# Modularization Design

## 1. Purpose

Modules group cohesive sets of providers, imports, and side-effect components. A module is simply a `@Component()` class that uses `@Provide` methods and/or `@Import`/`@Use` decorators to organize related providers.

There is no root/local module hierarchy. ESM already handles physical modularization. Kavri modules are purely logical groupings for provider organization. `@Provide` is not limited to modules — any `@Component()` class can use it.

## 2. Core APIs

```ts
declare function Import(...injectables: Injectable<any>[]): ClassDecorator;
declare function Use(...injectables: Injectable<any>[]): ClassDecorator;
```

### `@Import(...injectables)`

Ensures the listed injectables are **registered** when the decorated class is resolved. This is necessary for:

- Making specific implementations available for collection injection (`injectAll`/`injectMap`/`injectSet`).
- Declaring which concrete classes a module exposes.

Import does not instantiate — it only registers.

### `@Use(...injectables)`

Ensures the listed injectables are **instantiated** (and their `@Provide` methods processed) before the decorated class is resolved. Use for:

- Components with `@Provide` methods that must run.
- Side-effect components (event subscribers, background workers).
- Any dependency that must be alive for correct behavior.

### Container equivalents

```ts
class Container {
  import(...injectables: Injectable<any>[]): void;
  use(...injectables: Injectable<any>[]): void;
}
```

These are the imperative equivalents of the decorators. Use them when configuration is dynamic or happens at the container level.

## 3. What is a module?

A module is a `@Component()` class that contains `@Provide` methods. It may also use `@Import` and `@Use` decorators to declare its dependencies.

```ts
@Component()
@Import(PsqlDriver, MysqlDriver)
class DatabaseModule {
  @Provide(DataSource, { onDestroy: 'close' })
  async createDataSource(cfg = injectConfig(DbConfig)): Promise<DataSource> {
    return new DataSource(cfg.url);
  }
}
```

To activate a module, pass it to `container.use()` or reference it in `@Use(...)`:

```ts
container.use(DatabaseModule);
// or
@Use(DatabaseModule)
class Application { ... }
```

## 4. Rules

- **Module is optional.** Small applications can use `Container.provide()` and `Container.import()` directly.
- **Module does not change resolution semantics.** Provider scope, lifecycle, and injection behavior are identical whether a provider is registered via a module or directly.
- **Modules can compose.** A module can `@Use` other modules.
- **No circular module dependencies.** If module A uses module B and B uses A, startup fails.
- **`@Import` is additive.** Importing the same injectable multiple times is safe (idempotent).
- **`@Use` guarantees ordering.** Components listed in `@Use` are instantiated before the decorated class.

## 5. Import vs Use

| | `@Import` / `container.import()` | `@Use` / `container.use()` |
|---|---|---|
| **What it does** | Registers injectable (makes it available) | Instantiates injectable (triggers side effects) |
| **Processes `@Provide`?** | No | Yes |
| **When to use** | Concrete implementations for collections | Components with @Provide, side-effect components |
| **Ordering guarantee** | No (just registration) | Yes (instantiated before dependant) |

## 6. Full example

```ts
import {
  Container,
  Component,
  Provide,
  Import,
  Use,
  OnDestroy,
  EventBus,
  OnEvent,
  Event,
  inject,
  injectAll,
  token,
  computed,
} from 'kavri';
import { Configuration, injectConfig } from 'kavri/config';

// ---- driver module ----

@Configuration("database")
class DbConfig {
  driver!: string;
  url!: string;
}

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
@Import(PsqlDriver, MysqlDriver)
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
class CacheModule {
  @Provide(Redis, { onDestroy: 'disconnect' })
  async createRedis(url = inject(RedisUrl)): Promise<Redis> {
    const r = new Redis();
    await r.connect(url);
    return r;
  }
}

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

@Use(DriverModule, CacheModule)    // process @Provide methods, register imports
@Use(EmailNotifier)                // start side-effect listener
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

// provide the redis URL that CacheModule needs
container.provide(RedisUrl, () => 'redis://localhost:6379');

const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

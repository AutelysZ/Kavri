# Configuration Design

## 1. Position

Configuration is a first-class subsystem because it controls provider factories, computed selectors, and conditional components at runtime. The config module is built on the IoC core and follows the same injection patterns.

## 2. Schema definition

Two styles: class-based (`@Configuration`) and zod-based (`createConfigSchema`). Both produce schemas that can be injected via `injectConfig()`.

### 2.1 Class-based — `@Configuration(prefix)`

```ts
declare function Configuration(prefix: string): ClassDecorator;
```

Marks a class as a typed configuration schema bound to a config key prefix. Properties are populated from config sources. Supports class-validator decorators for validation.

```ts
@Configuration("database")
class DatabaseConfig {
  driver!: string;       // database.driver
  host!: string;         // database.host
  port!: number;         // database.port
  username!: string;     // database.username
  password!: string;     // database.password
}

@Configuration("app.feature")
class FeatureFlags {
  metricsEnabled!: boolean;   // app.feature.metricsEnabled
  betaMode!: boolean;         // app.feature.betaMode
}
```

### 2.2 Zod-based — `createConfigSchema(prefix, schema)`

```ts
declare type ZodSchema<T> = unknown;

declare class ConfigSchema<T> {
  readonly prefix: string;
  readonly schema: ZodSchema<T>;
}

declare function createConfigSchema<T>(
  prefix: string,
  schema: ZodSchema<T>,
): ConfigSchema<T>;
```

```ts
import { z } from 'zod';

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('my-app'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
  debug: z.boolean().default(false),
}));

const CorsConfig = createConfigSchema('cors', z.object({
  origins: z.array(z.string()).default(['*']),
  credentials: z.boolean().default(false),
}));
```

## 3. Config injection

```ts
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>): T;
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>, optional: true): T | undefined;
```

`injectConfig()` follows the same inject-point rules as `inject()` — it may only be called in constructor default params, token factories, computed resolvers, `@Provide` method params, and condition functions.

```ts
@Component()
class AppService {
  constructor(
    private readonly db = injectConfig(DatabaseConfig),         // required
    private readonly app = injectConfig(AppConfig),             // required
    private readonly flags = injectConfig(FeatureFlags, true),  // optional
  ) {}
}
```

## 4. Config sources & precedence

Sources are resolved in order (highest priority wins):

1. **Runtime override** — `Container.provide()` on the config schema
2. **CLI arguments** — matched by `argvPrefix` (e.g., `--app.name=foo`)
3. **Environment variables** — matched by `envPrefix` (e.g., `APP_NAME=foo`)
4. **Config files** — YAML, JSON, or TOML. Loaded in order; later files override earlier ones.
5. **Schema defaults** — class property defaults or zod `.default()` values

## 5. ConfigOptions — customizing sources

```ts
interface ConfigOptions {
  configFiles: string[];
  env: Record<string, string>;
  argv: string[];
  envPrefix: string;
  argvPrefix: string;
}

declare const ConfigOptions: Token<ConfigOptions>;
```

Override `ConfigOptions` via `Container.provide()` to customize where config values come from:

```ts
const container = new Container();
container.provide(ConfigOptions, (defaults = inject(ConfigOptions)) => ({
  ...defaults,
  configFiles: ['config/app.yaml', 'config/app.local.yaml'],
  env: process.env as Record<string, string>,
  argv: process.argv,
  envPrefix: 'MYAPP_',
  argvPrefix: '--myapp.',
}));
```

## 6. Validation & failure semantics

- **Missing required values** — startup fails with a clear error naming the missing key.
- **Parse/validation errors** — startup fails with validation details (zod errors or class-validator errors).
- **Type coercion** — env vars and CLI args are strings. The config system coerces to target types (number, boolean, arrays) based on the schema.
- **Unknown keys** — ignored by default. Can be made strict per schema if needed.

## 7. Config-driven component selection

The primary pattern for selecting providers based on config is `computed()`:

```ts
@Configuration("database")
class DbConfig {
  driver!: string;  // 'psql' | 'mysql'
}

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver { ... }

@Component({ name: 'mysql' })
class MysqlDriver extends Driver { ... }

// computed selects the driver based on config at resolution time
const SelectedDriver = computed<Driver>(
  (cfg = injectConfig(DbConfig), d = inject(Driver, cfg.driver)) => d,
);

@Component()
class Repository {
  constructor(private readonly driver = inject(SelectedDriver)) {}
}
```

This pattern replaces the need for dedicated `configSelector()` or `configRegistry()` helpers — `computed()` + `inject(Base, name)` covers all config-driven selection.

## 8. Conditional components via config

```ts
@Configuration("telemetry")
class TelemetryConfig {
  enabled!: boolean;
  endpoint!: string;
}

@Component({
  condition: (cfg = injectConfig(TelemetryConfig, true)) => cfg?.enabled ?? false,
})
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
  send(metric: string, value: number) {}
}

// consumers use optional injection since telemetry may be disabled
@Component()
class AppService {
  constructor(private readonly telemetry = inject(TelemetryService, true)) {}

  doWork() {
    this.telemetry?.send('work.done', 1);
  }
}
```

## 9. Introspection

```ts
declare function getAllRegisteredConfigurationNodes(): (Constructor<any> | ConfigSchema<any>)[];
```

Returns all registered config schemas. Static — does not require a container instance. Use for:

- Generating JSON Schema documentation
- Generating CLI `--help` text
- Config validation tooling

## 10. Full example

```ts
import {
  Container,
  Component,
  Provide,
  Import,
  Use,
  OnApplicationReady,
  inject,
  injectAll,
  computed,
  token,
} from 'kavri';
import {
  Configuration,
  ConfigOptions,
  ConfigSchema,
  createConfigSchema,
  injectConfig,
  getAllRegisteredConfigurationNodes,
} from 'kavri/config';
import { z } from 'zod';

// ---- class-based config ----

@Configuration("database")
class DbConfig {
  driver!: string;
  host!: string;
  port!: number;
  username!: string;
  password!: string;
  database!: string;
}

@Configuration("telemetry")
class TelemetryConfig {
  enabled!: boolean;
  endpoint!: string;
}

// ---- zod-based config ----

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('demo'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
  debug: z.boolean().default(false),
}));

const CacheConfig = createConfigSchema('cache', z.object({
  url: z.string(),
  ttl: z.number().default(3600),
}));

// ---- drivers ----

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

// config-driven driver selection
const SelectedDriver = computed<Driver>(
  (cfg = injectConfig(DbConfig), d = inject(Driver, cfg.driver)) => d,
);

// ---- conditional telemetry ----

@Component({
  condition: (cfg = injectConfig(TelemetryConfig, true)) => cfg?.enabled ?? false,
})
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
  send(metric: string, value: number) {}
}

// ---- cache module ----

declare class Redis {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
}

class CacheModule {
  @Provide(Redis, { onDestroy: 'disconnect' })
  async createRedis(cfg = injectConfig(CacheConfig)): Promise<Redis> {
    const r = new Redis();
    await r.connect(cfg.url);
    return r;
  }
}

// ---- application ----

@Import(PsqlDriver, MysqlDriver)
@Use(CacheModule)
class Application {
  constructor(
    private readonly appConfig = injectConfig(AppConfig),
    private readonly dbConfig = injectConfig(DbConfig),
    private readonly telemetry = inject(TelemetryService, true),
    private readonly driver = inject(SelectedDriver),
    private readonly drivers = injectAll(Driver, 'alphabetical'),
  ) {}

  @OnApplicationReady()
  async ready() {
    const driverNames = this.drivers.length;
    console.log(`${this.appConfig.name} ready (${this.appConfig.env}), ${driverNames} drivers`);
    this.telemetry?.send('app.ready', 1);
  }

  async run() {
    const result = await this.driver.query('select 1');
    console.log(result);
    this.telemetry?.send('query.executed', 1);
  }
}

// ---- introspection ----

const allSchemas = getAllRegisteredConfigurationNodes();
// returns: [DbConfig, TelemetryConfig, AppConfig, CacheConfig]

// ---- bootstrap ----

// config file: config/app.yaml
// ---
// app:
//   name: my-app
//   env: prod
// database:
//   driver: psql
//   host: db.example.com
//   port: 5432
//   username: admin
//   password: secret
//   database: mydb
// cache:
//   url: redis://localhost:6379
// telemetry:
//   enabled: true
//   endpoint: https://telemetry.example.com

const container = new Container();

container.provide(ConfigOptions, (defaults = inject(ConfigOptions)) => ({
  ...defaults,
  configFiles: ['config/app.yaml'],
  env: process.env as Record<string, string>,
  argv: process.argv,
  envPrefix: 'MYAPP_',
}));

const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

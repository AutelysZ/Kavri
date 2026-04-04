# Configuration Design

## 1. Position

Configuration is a first-class subsystem because it controls provider factories, computed selectors, and conditional components at runtime. The config module is built on the IoC core and follows the same injection patterns.

## 2. Schema definition — Zod only

All config schemas are defined using Zod. The schema is bound to a config key prefix.

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

The prefix maps to a nested key path in config files:

```ts
import { z } from 'zod';

// reads from `database:` in YAML
const DatabaseConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.number().default(5432),
  username: z.string(),
  password: z.string(),
  database: z.string(),
}));

// reads from `app:` in YAML
const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('my-app'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
  debug: z.boolean().default(false),
}));
```

## 3. Config injection

```ts
declare function injectConfig<T>(schema: ConfigSchema<T>): T;
declare function injectConfig<T>(schema: ConfigSchema<T>, optional: true): T | undefined;
```

Follows the same inject-point rules as `inject()`.

```ts
@Component()
class AppService {
  constructor(
    private readonly db = injectConfig(DatabaseConfig),       // required
    private readonly app = injectConfig(AppConfig),           // required
    private readonly telemetry = injectConfig(TelemetryConfig, true), // optional
  ) {}
}
```

## 4. Config sources & precedence

Sources are resolved in order (highest priority wins):

1. **`container.provide()` / `@Provide`** — runtime override of the config schema
2. **CLI arguments** — matched by `argvPrefix` (e.g., `--app.name=foo`)
3. **Environment variables** — matched by `envPrefix` (e.g., `APP_NAME=foo`)
4. **Config files** — YAML, JSON, or TOML. Loaded in order; later files override.
5. **Zod defaults** — `.default()` values in the schema

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

Use `container.decorate()` or `@Decorate` to customize:

```ts
// imperative
container.decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
  envPrefix: 'MYAPP_',
}));

// declarative
@Component()
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
}))
class ConfigModule {}
```

## 6. Validation & failure semantics

- **Missing required values** — startup fails with a clear error naming the missing key.
- **Parse/validation errors** — startup fails with zod validation details.
- **Type coercion** — env vars and CLI args are strings; coerced to target types based on the schema.
- **Unknown keys** — ignored by default.

## 7. Config-driven component selection

Use `computed()` + `inject(Base, name)`:

```ts
const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
}));

const SelectedDriver = computed<Driver>(
  (cfg = injectConfig(DbConfig), d = inject(Driver, cfg.driver)) => d,
);
```

## 8. Conditional components via config

```ts
const TelemetryConfig = createConfigSchema('telemetry', z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().optional(),
}));

@Component({
  condition: (cfg = injectConfig(TelemetryConfig, true)) => cfg?.enabled ?? false,
})
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
  send(metric: string, value: number) {}
}

@Component()
class AppService {
  constructor(private readonly telemetry = inject(TelemetryService, true)) {}
}
```

## 9. Introspection

```ts
declare function getAllRegisteredConfigurationNodes(): ConfigSchema<any>[];
```

Returns all registered config schemas. Static — no container needed. Use for generating JSON Schema documentation or CLI help text.

## 10. Full example

```ts
import {
  Container,
  Component,
  Provide,
  Decorate,
  Touch,
  Use,
  inject,
  injectAll,
  computed,
  token,
} from 'kavri';
import {
  ConfigOptions,
  ConfigSchema,
  createConfigSchema,
  injectConfig,
  getAllRegisteredConfigurationNodes,
} from 'kavri/config';
import { z } from 'zod';

// ---- config schemas ----

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('demo'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
  debug: z.boolean().default(false),
}));

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.number().default(5432),
  username: z.string(),
  password: z.string(),
  database: z.string(),
}));

const CacheConfig = createConfigSchema('cache', z.object({
  url: z.string(),
  ttl: z.number().default(3600),
}));

const TelemetryConfig = createConfigSchema('telemetry', z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().optional(),
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

@Component()
@Provide(Redis, async (cfg = injectConfig(CacheConfig)) => {
  const r = new Redis();
  await r.connect(cfg.url);
  return r;
}, { onDestroy: 'disconnect' })
class CacheModule {}

// ---- config module ----

@Component()
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
  env: process.env as Record<string, string>,
  argv: process.argv,
  envPrefix: 'MYAPP_',
}))
class ConfigModule {}

// ---- application ----

@Touch(PsqlDriver, MysqlDriver)
@Use(ConfigModule, CacheModule)
class Application {
  constructor(
    private readonly appConfig = injectConfig(AppConfig),
    private readonly dbConfig = injectConfig(DbConfig),
    private readonly telemetry = inject(TelemetryService, true),
    private readonly driver = inject(SelectedDriver),
    private readonly drivers = injectAll(Driver, 'alphabetical'),
  ) {}

  async run() {
    const result = await this.driver.query('select 1');
    console.log(`${this.appConfig.name} (${this.appConfig.env}): ${result}`);
    this.telemetry?.send('query.executed', 1);
  }
}

// ---- introspection ----

const allSchemas = getAllRegisteredConfigurationNodes();
// [AppConfig, DbConfig, CacheConfig, TelemetryConfig]

// ---- bootstrap ----

const container = new Container();
const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

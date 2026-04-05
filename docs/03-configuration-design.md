# Configuration Design

## 1. Position

Configuration is a first-class subsystem. `createConfigSchema()` returns a `Token<T>` decorated with `@Configuration`. Config values are injected with `inject()` like any other dependency.

## 2. Schema definition

```ts
interface ConfigurationMetadata<T> {
  prefix: string;
  schema: ZodSchema<T>;
}

declare function Configuration<T>(prefix: string, schema: ZodSchema<T>): ClassDecorator<ConfigurationMetadata<T>>;

declare function createConfigSchema<T>(prefix: string, schema: ZodSchema<T>): Token<T>;
```

The returned `Token<T>` carries `@Configuration` metadata. Its factory resolves from config sources using the zod schema for parsing and validation.

```ts
const DatabaseConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.number().default(5432),
  username: z.string(),
  password: z.string(),
}));

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('my-app'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
}));
```

## 3. Config injection

Config tokens are injected with `inject()`:

```ts
@Component()
class AppService {
  constructor(
    private readonly db = inject(DatabaseConfig),        // required
    private readonly app = inject(AppConfig),            // required
    private readonly tel = inject(TelemetryConfig, true), // optional
  ) {}
}
```

## 4. Config sources & precedence

1. **`@Provide`** — runtime override
2. **CLI arguments** — matched by `argvPrefix`
3. **Environment variables** — matched by `envPrefix`
4. **Config files** — YAML, JSON, TOML (loaded in order, later overrides)
5. **Zod defaults** — `.default()` values

## 5. ConfigOptions

```ts
interface ConfigVariableResolver {
  readonly prefix: string;
  resolve(key: string): Awaitable<string | undefined>;
}

interface ConfigOptions {
  configFiles: string[];
  env: Record<string, string>;
  argv: string[];
  envPrefix: string;
  argvPrefix: string;
  resolvers: ConfigVariableResolver[];
}

declare const ConfigOptions: Token<ConfigOptions>;
```

Customize via `@Decorate`:

```ts
@Component()
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
  envPrefix: 'MYAPP_',
}))
class ConfigModule {}
```

## 6. Variable substitution

After all config sources are merged, string values containing `${...}` are resolved before zod validation.

| Syntax | Behavior |
|---|---|
| `${key}` | Look up in merged config, then env vars |
| `${prefix:key}` | Delegate to resolver with matching prefix |
| `${key:-default}` | Use default if unresolved |
| `${prefix:key:-default}` | External with default |

- Only applies to string values. Use `z.coerce.*()` for non-string target types.
- Unresolved `${...}` without a default throws `ConfigValidationError`.
- Cross-references resolve transitively: `${a}` → `${b}` → `"hello"` resolves to `"hello"`.
- Circular references throw `ConfigValidationError`.

```yaml
database:
  host: "${DATABASE_HOST:-localhost}"
  port: "${DATABASE_PORT:-5432}"
  password: "${aws:prod/db-password}"
  url: "postgres://${database.host}:${database.port}"
```

## 7. External variable resolvers

Resolvers are plain objects implementing `ConfigVariableResolver`. They are not `@Component` classes — they're provided via `ConfigOptions.resolvers` and available before any config token resolves.

```ts
function createAwsResolver(region: string): ConfigVariableResolver {
  const client = new SecretsManagerClient({ region });
  return {
    prefix: 'aws',
    async resolve(key) {
      const result = await client.getSecretValue({ SecretId: key });
      return result.SecretString;
    },
  };
}

@Component()
@Decorate(ConfigOptions, async (prev) => ({
  ...prev,
  resolvers: [
    ...prev.resolvers,
    createAwsResolver(process.env.AWS_REGION ?? 'us-east-1'),
  ],
}))
class SecretsModule {}
```

Resolvers are initialized in the `@Decorate` factory, which is async-capable. This allows connecting to secret managers before config loads.

## 8. ConfigRegistry (internal)

`ConfigRegistry` is an internal class that loads all raw config sources (files, env, argv) into a unified key-value store, then resolves variable substitutions using resolvers from `ConfigOptions`. Config tokens created by `createConfigSchema()` depend on `ConfigRegistry`. Users do not interact with it directly.

## 9. Validation & failure

- Missing required values → `ConfigValidationError` with key name.
- Zod validation errors → `ConfigValidationError` with prefix and zod issues.
- Unresolved `${...}` without default → `ConfigValidationError`.
- Circular variable references → `ConfigValidationError`.
- Type coercion from env/CLI strings based on schema.

## 10. Config-driven selection

```ts
const SelectedDriver = token<Driver>(
  (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d,
);
```

## 11. Introspection

Since config schemas carry `@Configuration` metadata, all registered schemas can be discovered:

```ts
// Via the metadata system
const allConfigs = Metadata.of(Configuration, token);

// Or via injectAll with the Configuration decorator factory
const configs = injectAll(Configuration);
```

## 12. Full example

```ts
import {
  Container, Component, Provide, Decorate, Touch, Use,
  inject, injectAll, computed, token, Metadata,
} from 'kavri';
import { createConfigSchema, Configuration, ConfigOptions } from 'kavri/config';
import { z } from 'zod';

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('demo'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
}));

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  url: z.string(),
}));

const TelemetryConfig = createConfigSchema('telemetry', z.object({
  enabled: z.boolean().default(false),
}));

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = computed<Driver>(
  (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d,
);

@Component({
  condition: (cfg = inject(TelemetryConfig, true)) => cfg?.enabled ?? false,
})
class TelemetryService {
  constructor(private readonly config = inject(TelemetryConfig)) {}
  send(metric: string, value: number) {}
}

@Component()
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
  envPrefix: 'MYAPP_',
}))
class ConfigModule {}

@Touch(PsqlDriver)
@Use(ConfigModule)
class Application {
  constructor(
    private readonly app = inject(AppConfig),
    private readonly driver = inject(SelectedDriver),
    private readonly telemetry = inject(TelemetryService, true),
  ) {}

  async run() {
    const result = await this.driver.query('select 1');
    console.log(`${this.app.name} (${this.app.env}): ${result}`);
  }
}

const container = new Container();
const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

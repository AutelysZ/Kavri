# Configuration Design

## 1. Position

Configuration is a first-class subsystem with pluggable loaders, import resolvers, and class-based schemas. Config classes are decorated with `@Configuration(prefix)` (which composes `@Schema`) and injected via `injectConfig()`. Follows Spring Boot conventions: profile-based config files, external secret imports, and `${...}` variable substitution.

## 2. Architecture

```
Bootstrap phase (BootstrapConfigurationRegistry):
  @Configuration(prefix, { bootstrap: true }) classes
  Sources: @OverrideConfiguration < env < cli
  No config files. No variable substitution.

Load phase (ConfigurationRegistry @OnConstruct):
  1. @OverrideConfiguration code defaults
  2. Load config files ({configBase}.{ext}, {configBase}-{profile}.{ext})
  3. Merge: code defaults < config files < env < cli
  4. Build env context (process.env + imported external sources)
  5. Read kavri.config.import → load via Resolvers
  6. Resolve ${...} variables from env context

Config phase:
  injectConfig(clazz) → extract prefix, validate with @Schema field decorators
```

## 3. @Configuration Decorator

```ts
interface ConfigurationMetadata {
  prefix: string;
  bootstrap: boolean;
}

declare function Configuration(
  prefix: string,
  options?: { bootstrap?: boolean },
): ClassDecorator<ConfigurationMetadata>;
```

`@Configuration(prefix)` composes `@Schema()` -- all fields must have field decorators from `@kavri/schema` (`@IsString`, `@IsInteger`, `@IsBoolean`, etc.). No separate parser or `ConfigParser<T>` needed.

```ts
@Configuration('database')
class DatabaseConfig {
  @IsString() driver!: string;
  @IsString() host!: string;
  @IsInteger({ default: 5432 }) port!: number;
  @IsString() username!: string;
  @IsString() password!: string;
  @IsString() database!: string;
}
```

For bootstrap configuration (resolved from env/cli only, before config files load):

```ts
@Configuration('aws', { bootstrap: true })
class AwsResolverOptions {
  @IsString({ default: 'us-east-1' }) region!: string;
  @IsString({ optional: true }) accessKeyId?: string;
  @IsString({ optional: true }) secretAccessKey?: string;
}
```

## 4. injectConfig

```ts
declare function injectConfig<T>(clazz: AnyConstructor<T>): T;
declare function injectConfig<T>(clazz: AnyConstructor<T>, optional: true): T | undefined;
```

`injectConfig()` is an **inject point** -- usable in constructors, factories, conditions, and lifecycle hooks. The class must be decorated with `@Configuration(prefix)`.

Precedence for regular configs: `@Provide > cli > env > config file > @OverrideConfiguration > schema defaults`.

Precedence for bootstrap configs: `@Provide > cli > env > @OverrideConfiguration > schema defaults`.

```ts
@Component()
class UserService {
  constructor(private readonly config = injectConfig(DatabaseConfig)) {}
}

// Optional injection (returns undefined if config is not available):
@Component({
  condition: (config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false,
})
class TelemetryService {}
```

## 5. Loader

```ts
abstract class Loader {
  abstract supports(): string[];              // file extensions
  abstract load(content: string): Awaitable<object>;  // parse file content
}
```

Abstract class -- subclasses must be `@Component()`. Config module touches `JsonLoader`, `YamlLoader`, `TomlLoader` by default. Third-party loaders added via `@Touch`.

`ConfigurationRegistry` discovers extensions from `injectAll(Loader)` and tries `{configBase}.{ext}` for each, using the first found.

## 6. Resolver (import resolvers)

```ts
abstract class Resolver {
  abstract load(resource: string): Awaitable<Record<string, string>>;
}
```

Abstract class -- subclasses must be `@Component({ name })`. The name is the protocol selector for `kavri.config.import` entries. `ConfigurationRegistry` uses `injectMap(Resolver)` to find resolvers by name. `injectMap` requires all entries to have `@Component({ name })` -- throws if any doesn't.

```yaml
kavri:
  config:
    import:
      - "aws-secretmanager:prod/db-secrets?prefix=database"
      - "vault:secret/redis"
```

For `aws-secretmanager:prod/db-secrets?prefix=database`:
- Protocol: `aws-secretmanager` -> `injectMap(Resolver).get('aws-secretmanager')`
- Resource: `prod/db-secrets?prefix=database` -> `resolver.load(resource)`
- Result: key-value pairs merged into env context for `${...}` substitution

## 7. Bootstrap configuration

Bootstrap configs use `@Configuration(prefix, { bootstrap: true })`. They are resolved before config files by `BootstrapConfigurationRegistry`. No config files, no variable substitution.

Precedence: `@Provide > cli > env > @OverrideConfiguration > schema defaults`.

Env mapping: prefix uppercased. `'aws'` -> `AWS_REGION`.
CLI mapping: `'--'` + prefix. `'aws'` -> `--aws.region`.

### BootstrapOptions

```ts
@Configuration('config', { bootstrap: true })
class BootstrapOptions {
  @IsString({ default: './config/config' }) configBase!: string;
  @IsArray(IsString(), { default: [] }) profiles!: string[];
  @IsRecord(IsString(), { default: process.env }) env!: Record<string, string>;
  @IsArray(IsString(), { default: process.argv }) argv!: string[];
  @IsString({ default: '' }) envPrefix!: string;
  @IsString({ default: '' }) argvPrefix!: string;
}
```

Config file discovery: try `{configBase}.{ext}` for each extension from `injectAll(Loader)`, use first found. For each profile: `{configBase}-{profile}.{ext}`, merge on top. Later profiles override earlier.

### BootstrapConfigurationRegistry (internal)

Internal singleton for bootstrap configs.

`@OnConstruct` lifecycle:
1. Read `@OverrideConfiguration` for bootstrap classes (`Metadata.entries(OverrideConfiguration)`)
2. Merge env vars (`Metadata.entries(Configuration)` for field mapping)
3. Merge cli args

No config files. No variable substitution.

`registry.resolve(clazz)`: reads prefix from `Metadata.of(Configuration, clazz)`. Validates with the class schema (field decorators).

## 8. @OverrideConfiguration

```ts
interface OverrideConfigurationMetadata<T> {
  clazz: AnyConstructor<T>;
  override: (prev: Partial<T> | undefined) => Partial<T> | undefined;
}

declare function OverrideConfiguration<T>(
  clazz: AnyConstructor<T>,
  override: (prev: Partial<T> | undefined) => Partial<T> | undefined,
): ClassDecorator<OverrideConfigurationMetadata<T>>;
```

Code-level defaults for any `@Configuration` class (bootstrap or regular). Lower priority than env/cli (and config files for regular). The callback receives the previous override value (or `undefined` if first) and returns the merged partial. Multiple for the same class: chained in `@Use` order.

## 9. Variable substitution

After all sources are merged and imports are resolved, string values containing `${...}` are resolved from the **env context**.

The env context is built from:
1. `BootstrapOptions.env` (process.env by default)
2. Values loaded by import resolvers (merged on top)

| Syntax | Behavior |
|---|---|
| `${key}` | Look up in env context |
| `${key:-default}` | Use default if not in env context |

Only applies to regular configs (not bootstrap).

## 10. ConfigurationRegistry (internal)

Internal singleton for regular configs. Depends on `BootstrapConfigurationRegistry` (for `BootstrapOptions`) and Loaders/Resolvers.

`@OnConstruct` lifecycle (in order):
1. **Read `@OverrideConfiguration`** -- `Metadata.entries(OverrideConfiguration)`, lowest priority
2. **Load config files** -- extensions from `injectAll(Loader)`, try `{configBase}.{ext}` then `{configBase}-{profile}.{ext}` per profile
3. **Merge config files** over code defaults
4. **Merge env vars** -- `Metadata.entries(Configuration)` for field mapping
5. **Merge cli args**
6. **Build env context** -- start with `BootstrapOptions.env` (process.env)
7. **Read `kavri.config.import`** from merged config
8. **Load imports** -- parse `{protocol}:{resource}`, find via `injectMap(Resolver)`, call `resolver.load(resource)`, merge into env context
9. **Resolve `${...}` variables** using env context

`registry.resolve(clazz)`: reads prefix from `Metadata.of(Configuration, clazz)`. Extracts node at prefix. Validates with the class schema (field decorators).

## 11. Full example

```ts
import {
  Container, Component, Touch, Use, OverrideConfiguration,
  inject, injectAll, token,
} from '@kavri/core';
import {
  Configuration, injectConfig, BootstrapOptions,
  Resolver, Loader,
} from '@kavri/config';
import { IsString, IsInteger, IsArray } from '@kavri/schema';

// --- bootstrap ---

@Configuration('aws', { bootstrap: true })
class AwsResolverOptions {
  @IsString({ default: 'us-east-1' }) region!: string;
}

// --- import resolver ---

@Component({ name: 'aws-secretmanager' })
class AwsSecretManagerResolver extends Resolver {
  constructor(private readonly opts = injectConfig(AwsResolverOptions)) { super(); }
  async load(resource: string) {
    return { 'database.password': 'secret123' };
  }
}

// --- config schemas ---

@Configuration('database')
class DatabaseConfig {
  @IsString() driver!: string;
  @IsString() host!: string;
  @IsInteger({ default: 5432 }) port!: number;
  @IsString() password!: string;
}

@Configuration('app')
class AppConfig {
  @IsString({ default: 'my-app' }) name!: string;
  @IsString({ in: ['dev', 'staging', 'prod'], default: 'dev' }) env!: string;
}

// --- driver ---

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = token<Driver>(
  (cfg = injectConfig(DatabaseConfig), d = inject(Driver, cfg.driver)) => d,
);

// --- application ---

// config/config.yaml:
// ---
// kavri:
//   config:
//     import:
//       - "aws-secretmanager:prod/db?prefix=database"
// app:
//   name: pet-store
// database:
//   driver: psql
//   host: "${DATABASE_HOST:-localhost}"
//   password: "${database.password}"
//
// config/config-prod.yaml:
// ---
// app:
//   env: prod

@Component()
@Touch(PsqlDriver)
@Touch(AwsSecretManagerResolver)
@OverrideConfiguration(BootstrapOptions, () => ({
  configBase: './config/config',
  profiles: ['prod'],
  envPrefix: 'MYAPP_',
}))
class Application {
  constructor(
    private readonly app = injectConfig(AppConfig),
    private readonly driver = inject(SelectedDriver),
  ) {}

  async run() {
    console.log(`${this.app.name} (${this.app.env}): ${await this.driver.query('select 1')}`);
  }
}

const container = new Container();
const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

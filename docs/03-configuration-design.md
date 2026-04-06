# Configuration Design

## 1. Position

Configuration is a first-class subsystem with pluggable loaders, import resolvers, and class-based schemas. Config classes are decorated with `@Configuration(prefix)` (which composes `@Schema`) and injected via `injectConfig()`. Follows Spring Boot conventions: profile-based config files, external secret imports, and `${...}` variable substitution.

There is no bootstrap/regular split. All configuration classes use a single `@Configuration(prefix, options?)` decorator and are managed by a single `ConfigurationRegistry`.

## 2. Architecture

```
ConfigurationRegistry @OnConstruct (Spring-style layered resolution):
  1. pushCodeOverrides()    — @OverrideConfiguration values (lowest priority)
  2. bind(EnvOptions)       — get env/argv sources
  3. unshiftEnv(env)        — push env layer (higher than code, lower than cli)
  4. unshiftArgv(argv)      — push cli layer (highest priority)
  5. mergeEnvVariables(env) — env vars also serve as variables for ${...}
  6. bind(ConfigFileOptions) — determine config file path (cli/env can override)
  7. parseRootFile()        — load & parse config file, insert after cli/env layers
  8. bind(ProfileOptions)   — determine active profiles (root file can specify)
  9. parseProfileFiles()    — load profile files, insert before root file
 10. bind(VariantOptions)   — parse variant settings (envPrefix, argvPrefix, variables, allowUnused)
 11. invokeResolvers()      — for each Resolver (injectAll(Resolver)):
         bind resolver's getOptionsClass() -> if has values, call resolve(options)
         -> merge returned variables
 12. validate()             — check allowUnused constraint

Config phase:
  injectConfig(clazz) -> ConfigurationRegistry.bind(clazz)
  -> extract prefix, validate with @Schema field decorators
```

## 3. @Configuration Decorator

```ts
interface ConfigurationOptions {
  /** Hide from help output and/or schema generation. */
  hidden?: boolean | 'schema';
}

interface ConfigurationMetadata {
  prefix: string;
  options: ConfigurationOptions;
}

declare function Configuration(
  prefix: string,
  options?: ConfigurationOptions,
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

## 4. Built-in configuration classes

These are the framework-provided `@Configuration` classes that control the registry lifecycle. They replace the old `BootstrapOptions` with focused, single-responsibility classes.

### EnvOptions

```ts
/** Not modifiable via env/cli/file. Hidden from help and schema. */
@Configuration('kavri.config', { hidden: true })
class EnvOptions {
  env: Record<string, string> = process.env;
  argv: string[] = process.argv.slice(2);
}
```

Provides the raw env and argv sources. Bound first during registry init. Hidden from help and schema because it is not user-configurable.

### ConfigFileOptions

```ts
/** Config file path. Hidden from schema only. Modifiable via env/cli. */
@Configuration('kavri.config', { hidden: 'schema' })
class ConfigFileOptions {
  @IsString({ default: './config/config' })
  configFile!: string;
}
```

Determines the config file path. Can be overridden via env or cli. Hidden from schema generation but visible in help.

### ProfileOptions

```ts
/** Active profiles. */
@Configuration('kavri.config')
class ProfileOptions {
  @IsArray(IsString(), { default: [] })
  profiles!: string[];
}
```

Determines active profiles. The root config file can specify profiles, or they can be set via env/cli.

### VariantOptions

```ts
/** Variant options controlling env/cli mapping, variables, and strictness. */
@Configuration('kavri.config')
class VariantOptions {
  @IsString({ default: '' }) envPrefix!: string;
  @IsString({ default: '' }) argvPrefix!: string;
  @IsRecord(IsString(), { default: {} }) variables!: Record<string, string>;
  @IsBoolean({ default: false }) allowUnused!: boolean;
}
```

Controls env/cli prefix mapping, extra variables for `${...}` substitution, and strictness for unused config keys.

## 5. injectConfig

```ts
declare function injectConfig<T>(clazz: AnyConstructor<T>): T;
declare function injectConfig<T>(clazz: AnyConstructor<T>, optional: true): T | undefined;
```

`injectConfig()` is an **inject point** -- usable in constructors, factories, `@Conditional` predicates, and lifecycle hooks. The class must be decorated with `@Configuration(prefix)`. Internally calls `ConfigurationRegistry.bind(clazz)`.

Precedence: `cli > env > config file > @OverrideConfiguration > schema defaults`.

Variable substitution (`${key}` / `${key:-default}`) occurs during `bind()` using accumulated variables (env + resolver-provided).

```ts
@Component()
class UserService {
  constructor(private readonly config = injectConfig(DatabaseConfig)) {}
}

// Conditional injection:
@Component()
@Conditional((config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false)
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
}
```

## 6. Loader

```ts
abstract class Loader {
  abstract supports(): string[];              // file extensions
  abstract load(content: string): Awaitable<object>;  // parse file content
}
```

Abstract class -- subclasses must be `@Component()`. Config module touches `JsonLoader`, `YamlLoader`, `TomlLoader` by default. Third-party loaders added via `@Touch`.

`ConfigurationRegistry` discovers extensions from `injectAll(Loader)` and tries `{configFile}.{ext}` for each, using the first found.

## 7. Resolver

```ts
/**
 * Abstract variable resolver. Each resolver provides its own options class
 * via getOptionsClass(). The registry binds the options and passes them to resolve().
 * If the options class yields no values, resolve() is not invoked.
 *
 * Subclasses must be @Component(). Must NOT have @Conditional.
 * Must NOT use injectConfig() — use getOptionsClass() instead.
 * Discovered via injectAll(Resolver).
 */
abstract class Resolver<T = any> {
  abstract getOptionsClass(): AnyConstructor<T>;
  abstract resolve(options: T): Awaitable<Record<string, string>>;
}
```

Resolvers load external key-value pairs into the variable context. Each resolver defines its own options class via `getOptionsClass()`. The registry binds that options class and, if it has values, calls `resolve(options)`. The returned key-value pairs are merged into the variable context for `${...}` substitution.

Resolvers are discovered via `injectAll(Resolver)` (not `injectMap`). Each resolver manages its own import strategy -- there is no `kavri.config.import` protocol dispatch.

```ts
@Configuration('kavri.resolver.aws.secretmanager')
class AwsSecretManagerResolverOptions {
  @IsString() region!: string;
  @IsArray(IsObject({ name: IsString(), prefix: IsString() }))
  items!: Array<{ name: string; prefix: string }>;
}

@Component()
class AwsSecretManagerResolver extends Resolver<AwsSecretManagerResolverOptions> {
  getOptionsClass() { return AwsSecretManagerResolverOptions; }

  async resolve(opts: AwsSecretManagerResolverOptions) {
    const client = new SecretsManagerClient(opts);
    const entries: Record<string, string> = {};
    for (const item of opts.items) {
      const result = await client.getSecretValue({ SecretId: item.name });
      const secrets = JSON.parse(result.SecretString ?? '{}');
      for (const [k, v] of Object.entries(secrets)) {
        entries[item.prefix ? `${item.prefix}.${k}` : k] = String(v);
      }
    }
    return entries;
  }
}
```

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

Code-level defaults for a `@Configuration` class. Lowest priority layer -- overridden by config files, env, and cli. The callback receives the previous override value (or `undefined` if first) and returns the merged partial. Multiple for the same class: chained in `@Use` order.

**CONSTRAINT:** Classes with `@OverrideConfiguration` must NOT have `@Conditional`. Enforced at runtime and by `@kavri/eslint-plugin`.

`@OverrideConfiguration` targets config **classes** (not tokens):

```ts
@Component()
@OverrideConfiguration(ConfigFileOptions, () => ({ configFile: './config/app' }))
@OverrideConfiguration(ProfileOptions, () => ({ profiles: ['prod'] }))
@OverrideConfiguration(VariantOptions, () => ({ envPrefix: 'MYAPP_' }))
@OverrideConfiguration(DatabaseConfig, () => ({
  port: 5432,
  host: 'localhost',
}))
class AppConfigModule {}
```

## 9. Variable substitution

After all sources are merged and resolvers are invoked, string values containing `${...}` are resolved from the **variable context**.

The variable context is built from:
1. `EnvOptions.env` (process.env by default)
2. Values loaded by Resolvers (merged on top)
3. `VariantOptions.variables` (explicit variables)

| Syntax | Behavior |
|---|---|
| `${key}` | Look up in variable context |
| `${key:-default}` | Use default if not in variable context |

## 10. ConfigurationRegistry (internal)

Internal singleton. Manages layered config data.

`@OnConstruct` lifecycle (Spring-style layered resolution):

1. **`pushCodeOverrides()`** -- `@OverrideConfiguration` values (lowest priority)
2. **`bind(EnvOptions)`** -- get env/argv sources
3. **`unshiftEnv(env)`** -- push env layer (higher than code, lower than cli)
4. **`unshiftArgv(argv)`** -- push cli layer (highest priority)
5. **`mergeEnvVariables(env)`** -- env vars also serve as variables for `${...}`
6. **`bind(ConfigFileOptions)`** -- determine config file path (cli/env can override)
7. **`parseRootFile()`** -- load & parse config file, insert after cli/env layers
8. **`bind(ProfileOptions)`** -- determine active profiles (root file can specify)
9. **`parseProfileFiles()`** -- load profile files, insert before root file
10. **`bind(VariantOptions)`** -- parse variant settings (envPrefix, argvPrefix, variables, allowUnused)
11. **`invokeResolvers()`** -- for each Resolver (`injectAll(Resolver)`): bind resolver's `getOptionsClass()` -> if has values, call `resolve(options)` -> merge returned variables
12. **`validate()`** -- check `allowUnused` constraint

**`bind<T>(configClass)`**: Parse config class from current layered state. Cached: each class is bound exactly once. Variable substitution (`${key}` / `${key:-default}`) performed during bind using accumulated variables (env + resolver-provided).

## 11. Full example

```ts
import {
  Container, Component, Conditional, Touch, Use, OverrideConfiguration,
  inject, injectAll, token,
} from '@kavri/core';
import {
  Configuration, injectConfig,
  ConfigFileOptions, ProfileOptions, VariantOptions,
  Resolver, Loader,
} from '@kavri/config';
import { IsString, IsInteger, IsArray, IsBoolean, IsObject } from '@kavri/schema';

// --- resolver options ---

@Configuration('kavri.resolver.aws.secretmanager')
class AwsSecretManagerResolverOptions {
  @IsString({ default: 'us-east-1' }) region!: string;
  @IsArray(IsObject({ name: IsString(), prefix: IsString() }))
  items!: Array<{ name: string; prefix: string }>;
}

// --- import resolver ---

@Component()
class AwsSecretManagerResolver extends Resolver<AwsSecretManagerResolverOptions> {
  getOptionsClass() { return AwsSecretManagerResolverOptions; }

  async resolve(opts: AwsSecretManagerResolverOptions) {
    // fetch secrets and return key-value pairs
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

@Configuration('telemetry')
class TelemetryConfig {
  @IsBoolean({ default: false }) enabled!: boolean;
}

// --- driver ---

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component('psql')
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = token<Driver>(
  (cfg = injectConfig(DatabaseConfig), d = inject(Driver, cfg.driver)) => d,
);

// --- conditional component ---

@Component()
@Conditional((config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false)
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
  send(metric: string, value: number): void {}
}

// --- application ---

// config/config.yaml:
// ---
// app:
//   name: pet-store
// database:
//   driver: psql
//   host: "${DATABASE_HOST:-localhost}"
//   password: "${database.password}"
//
// kavri:
//   resolver:
//     aws:
//       secretmanager:
//         region: us-west-2
//         items:
//           - name: prod/db
//             prefix: database
//
// config/config-prod.yaml:
// ---
// app:
//   env: prod

@Component()
@Touch(PsqlDriver)
@Touch(AwsSecretManagerResolver)
@OverrideConfiguration(ConfigFileOptions, () => ({
  configFile: './config/config',
}))
@OverrideConfiguration(ProfileOptions, () => ({
  profiles: ['prod'],
}))
@OverrideConfiguration(VariantOptions, () => ({
  envPrefix: 'MYAPP_',
}))
class Application {
  constructor(
    private readonly app = injectConfig(AppConfig),
    private readonly driver = inject(SelectedDriver),
    private readonly telemetry = inject(TelemetryService, true),
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

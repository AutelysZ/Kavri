# Configuration Design

## 1. Position

Configuration is a first-class subsystem with pluggable loaders, import resolvers, and parsers. Config values are tokens — injected with `inject()` like any other dependency. Follows Spring Boot conventions: profile-based config files, external secret imports, and `${...}` variable substitution.

## 2. Architecture

```
Bootstrap phase (BootstrapConfigurationRegistry):
  createBootstrapConfiguration() → BootstrapOptions, AwsResolverOptions, ...
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
  registry.parse(token) → extract prefix, validate with parser
```

## 3. ConfigParser

```ts
interface ConfigParser<T> {
  parse(raw: unknown): T;
}
```

Zod schemas satisfy this naturally. Custom parsers for class-validator, joi, etc.

## 4. Loader

```ts
abstract class Loader {
  abstract supports(): string[];              // file extensions
  abstract load(content: string): Awaitable<object>;  // parse file content
}
```

Abstract class — subclasses must be `@Component()`. Config module touches `JsonLoader`, `YamlLoader`, `TomlLoader` by default. Third-party loaders added via `@Touch`.

`ConfigurationRegistry` discovers extensions from `injectAll(Loader)` and tries `{configBase}.{ext}` for each, using the first found.

## 5. Resolver (import resolvers)

```ts
abstract class Resolver {
  abstract load(resource: string): Awaitable<Record<string, string>>;
}
```

Abstract class — subclasses must be `@Component({ name })`. The name is the protocol selector for `kavri.config.import` entries. `ConfigurationRegistry` uses `injectMap(Resolver)` to find resolvers by name. `injectMap` requires all entries to have `@Component({ name })` — throws if any doesn't.

```yaml
kavri:
  config:
    import:
      - "aws-secretmanager:prod/db-secrets?prefix=database"
      - "vault:secret/redis"
```

For `aws-secretmanager:prod/db-secrets?prefix=database`:
- Protocol: `aws-secretmanager` → `injectMap(Resolver).get('aws-secretmanager')`
- Resource: `prod/db-secrets?prefix=database` → `resolver.load(resource)`
- Result: key-value pairs merged into env context for `${...}` substitution

## 6. Bootstrap configuration

```ts
interface BootstrapConfigurationMetadata<T> {
  prefix: string;
  parser: ConfigParser<T>;
}

declare function BootstrapConfiguration<T>(
  prefix: string, parser: ConfigParser<T>,
): ClassDecorator<BootstrapConfigurationMetadata<T>>;

declare function createBootstrapConfiguration<T>(
  prefix: string, parser: ConfigParser<T>,
): Token<T>;
```

Bootstrap configs are resolved before config files by `BootstrapConfigurationRegistry`. No config files, no variable substitution.

Precedence: `@Provide > cli > env > @OverrideConfiguration > parser defaults`.

Env mapping: prefix uppercased. `'aws'` → `AWS_REGION`.
CLI mapping: `'--'` + prefix. `'aws'` → `--aws.region`.

### BootstrapOptions

```ts
interface BootstrapOptions {
  configBase: string;       // default: './config/config'
  profiles: string[];       // default: []
  env: Record<string, string>;  // default: process.env
  argv: string[];           // default: process.argv
  envPrefix: string;        // default: ''
  argvPrefix: string;       // default: '' (without '--')
}

declare const BootstrapOptions: Token<BootstrapOptions>;
```

Internally: `createBootstrapConfiguration('config', z.object({ ... }))`.

Config file discovery: try `{configBase}.{ext}` for each extension from `injectAll(Loader)`, use first found. For each profile: `{configBase}-{profile}.{ext}`, merge on top. Later profiles override earlier.

### BootstrapConfigurationRegistry (internal)

Internal singleton for bootstrap configs.

`@OnConstruct` lifecycle:
1. Read `@OverrideConfiguration` for bootstrap tokens (`Metadata.entries(OverrideConfiguration)`)
2. Merge env vars (`Metadata.entries(BootstrapConfiguration)` for field mapping)
3. Merge cli args

No config files. No variable substitution.

`registry.parse(token)`: reads prefix/parser from `Metadata.of(BootstrapConfiguration, token)`. Validates with parser.

## 7. Regular configuration

```ts
interface ConfigurationMetadata<T> {
  prefix: string;
  parser: ConfigParser<T>;
}

declare function Configuration<T>(
  prefix: string, parser: ConfigParser<T>,
): ClassDecorator<ConfigurationMetadata<T>>;

declare function createConfiguration<T>(
  prefix: string, parser: ConfigParser<T>,
): Token<T>;
```

Token factory: `(registry = inject(ConfigurationRegistry)) => registry.parse(token)`.

Precedence: `@Provide > cli > env > config file > @OverrideConfiguration > parser defaults`.

## 8. @OverrideConfiguration

```ts
interface OverrideConfigurationMetadata<T> {
  token: Token<T>;
  override: (prev: Partial<T> | undefined) => Partial<T> | undefined;
}

declare function OverrideConfiguration<T>(
  configToken: Token<T>,
  override: (prev: Partial<T> | undefined) => Partial<T> | undefined,
): ClassDecorator<OverrideConfigurationMetadata<T>>;
```

Code-level defaults for any config token (bootstrap or regular). Lower priority than env/cli (and config files for regular). The callback receives the previous override value (or `undefined` if first) and returns the merged partial. Multiple for the same token: chained in `@Use` order.

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
1. **Read `@OverrideConfiguration`** — `Metadata.entries(OverrideConfiguration)`, lowest priority
2. **Load config files** — extensions from `injectAll(Loader)`, try `{configBase}.{ext}` then `{configBase}-{profile}.{ext}` per profile
3. **Merge config files** over code defaults
4. **Merge env vars** — `Metadata.entries(Configuration)` for field mapping
5. **Merge cli args**
6. **Build env context** — start with `BootstrapOptions.env` (process.env)
7. **Read `kavri.config.import`** from merged config
8. **Load imports** — parse `{protocol}:{resource}`, find via `injectMap(Resolver)`, call `resolver.load(resource)`, merge into env context
9. **Resolve `${...}` variables** using env context

`registry.parse(token)`: reads prefix/parser from `Metadata.of(Configuration, token)`. Extracts node at prefix. Validates with parser.

## 11. Full example

```ts
import {
  Container, Component, Touch, Use, OverrideConfiguration,
  inject, injectAll, token,
} from 'kavri';
import {
  createConfiguration, createBootstrapConfiguration, BootstrapOptions,
  Resolver, Loader, Configuration,
} from 'kavri/config';
import { z } from 'zod';

// --- bootstrap ---

const AwsOpts = createBootstrapConfiguration('aws', z.object({
  region: z.string().default('us-east-1'),
}));

// --- import resolver ---

@Component({ name: 'aws-secretmanager' })
class AwsSecretManagerResolver extends Resolver {
  constructor(private readonly opts = inject(AwsOpts)) { super(); }
  async load(resource: string) {
    return { 'database.password': 'secret123' };
  }
}

// --- config schemas ---

const DbConfig = createConfiguration('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.coerce.number().default(5432),
  password: z.string(),
}));

const AppConfig = createConfiguration('app', z.object({
  name: z.string().default('my-app'),
  env: z.enum(['dev', 'staging', 'prod']).default('dev'),
}));

// --- driver ---

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = token<Driver>(
  (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d,
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
    private readonly app = inject(AppConfig),
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

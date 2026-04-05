# Configuration Design

## 1. Position

Configuration is a first-class subsystem with pluggable loaders, import resolvers, and parsers. Config values are tokens — injected with `inject()` like any other dependency. Follows Spring Boot conventions: profile-based config files, external secret imports, and `${...}` variable substitution.

## 2. Architecture

```
Bootstrap phase (env/cli only):
  createBootstrapOption() → ConfigOptions, AwsResolverOptions, ...

Load phase (ConfigRegistry @OnConstruct):
  1. @ConfigDefault code defaults
  2. Load config files ({configBase}.{ext}, {configBase}-{profile}.{ext})
  3. Merge: code defaults < config files < env < cli
  4. Build env context (process.env + imported external sources)
  5. Read kavri.config.import → load external sources via Resolvers
  6. Resolve ${...} variables from env context

Config phase:
  registry.parse(token) → extract prefix, validate with parser
```

## 3. Parser

```ts
interface ConfigParser<T> {
  parse(raw: unknown): T;
}
```

Zod schemas satisfy this. Custom parsers for class-validator, joi, etc.

## 4. Loader

```ts
@Component()
abstract class Loader {
  abstract supports(): string[];  // file extensions
  abstract load(content: string): Record<string, unknown>;
}
```

Built-in (touched by config module): `JsonLoader`, `YamlLoader`, `TomlLoader`. Third-party loaders added via `@Touch`.

ConfigRegistry discovers extensions from `injectAll(Loader)` and tries `{configBase}.{ext}` for each, using the first found.

## 5. Resolver (import resolvers)

```ts
@Component()
abstract class Resolver {
  abstract load(resource: string): Awaitable<Record<string, string>>;
}
```

Resolvers handle `kavri.config.import` entries. Each resolver MUST have `@Component({ name })` — the name is the protocol selector. ConfigRegistry uses `injectMap(Resolver)` to find resolvers by name.

```yaml
kavri:
  config:
    import:
      - "aws-secretmanager:prod/db-secrets?prefix=database"
      - "vault:secret/redis"
```

For `aws-secretmanager:prod/db-secrets?prefix=database`:
- Protocol: `aws-secretmanager` → finds resolver via `injectMap(Resolver).get('aws-secretmanager')`
- Resource: `prod/db-secrets?prefix=database` → passed to `resolver.load()`
- Result: key-value pairs merged into env context for `${...}` substitution

`injectMap(Resolver)` requires all Resolver subclasses to have `@Component({ name })`. If any doesn't, it throws.

## 6. Bootstrap options

```ts
declare function createBootstrapOption<T>(prefix: string, parser: ConfigParser<T>): Token<T>;
```

Resolved before config files. Precedence: `@Provide > cli > env > @ConfigDefault > parser defaults`.

### ConfigOptions

```ts
interface ConfigOptions {
  configBase: string;       // base path, default: './config/config'
  profiles: string[];       // active profiles, default: []
  env: Record<string, string>;
  argv: string[];
  envPrefix: string;
  argvPrefix: string;
}
```

Config file discovery: try `{configBase}.{ext}` for each extension from `injectAll(Loader)`, use first found. Then for each profile: `{configBase}-{profile}.{ext}`. Profile files override base values. Later profiles override earlier ones.

## 7. Config schema

```ts
declare function createConfigSchema<T>(prefix: string, parser: ConfigParser<T>): Token<T>;
```

Precedence: `@Provide > cli > env > config file > @ConfigDefault > parser defaults`.

## 8. @ConfigDefault

```ts
declare function ConfigDefault<T>(token: Token<T>, defaults: Partial<T>): ClassDecorator<...>;
```

Code-level defaults. Lower priority than files/env/cli. Multiple for the same token: deep-merged in @Use order.

## 9. Variable substitution

After all sources are merged and imports are resolved, string values containing `${...}` are resolved from the **env context**.

The env context is built from:
1. `ConfigOptions.env` (process.env by default)
2. Values loaded by import resolvers (merged on top)

| Syntax | Behavior |
|---|---|
| `${key}` | Look up in env context |
| `${key:-default}` | Use default if not in env context |

## 10. ConfigRegistry lifecycle

Internal singleton. `@OnConstruct` (in order):

1. **Read @ConfigDefault** — `Metadata.entries(ConfigDefault)`, lowest priority layer
2. **Load config files** — extensions from `injectAll(Loader)`, try `{configBase}.{ext}` then `{configBase}-{profile}.{ext}` per profile
3. **Merge config files** over code defaults
4. **Merge env vars** — uses `Metadata.entries(Configuration)` for field name mapping
5. **Merge cli args** — same metadata
6. **Build env context** — start with `ConfigOptions.env` (process.env)
7. **Read `kavri.config.import`** from merged config
8. **Load imports** — for each entry, parse `{protocol}:{resource}`, find Resolver via `injectMap(Resolver)`, call `resolver.load(resource)`, merge results into env context
9. **Resolve `${...}` variables** in all config values using env context

`registry.parse(token)`: read prefix/parser from `Metadata.of(Configuration, token)`, extract node, validate.

## 11. Full example

```ts
import {
  Container, Component, Touch, Use, ConfigDefault,
  inject, injectAll, token,
} from 'kavri';
import {
  createConfigSchema, createBootstrapOption, ConfigOptions,
  Resolver, Loader,
} from 'kavri/config';
import { z } from 'zod';

// --- bootstrap ---

const AwsOpts = createBootstrapOption('aws', z.object({
  region: z.string().default('us-east-1'),
}));

// --- import resolver ---

@Component({ name: 'aws-secretmanager' })
class AwsSecretManagerResolver extends Resolver {
  constructor(private readonly opts = inject(AwsOpts)) { super(); }
  async load(resource: string) {
    // parse resource, fetch secrets, return { key: value }
    return { 'database.password': 'secret123' };
  }
}

// --- config schemas ---

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.coerce.number().default(5432),
  password: z.string(),
}));

const AppConfig = createConfigSchema('app', z.object({
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
@ConfigDefault(ConfigOptions, {
  configBase: './config/config',
  profiles: ['prod'],
  envPrefix: 'MYAPP_',
})
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

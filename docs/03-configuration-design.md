# Configuration Design

## 1. Position

Configuration is a first-class subsystem with pluggable loaders, resolvers, and parsers. Config values are tokens — injected with `inject()` like any other dependency.

## 2. Architecture

```
Bootstrap phase (env/cli only):
  createBootstrapOption() → ConfigOptions, AwsResolverOptions, ...

Load phase:
  injectAll(Loader)    → parse config files (json, yaml, toml, .env, ...)
  injectAll(Resolver)  → resolve ${prefix:key} placeholders

Config phase (all sources):
  createConfigSchema() → DatabaseConfig, AppConfig, ...
```

## 3. Parser (pluggable validation)

```ts
interface ConfigParser<T> {
  parse(raw: unknown): T;
}
```

Zod schemas satisfy this naturally (they have `.parse()`). Custom parsers can be created for class-validator, joi, etc. Both `createConfigSchema` and `createBootstrapOption` accept `ConfigParser<T>`.

## 4. Loader (pluggable file formats)

```ts
@Component()
abstract class Loader {
  abstract supports(): string[];  // file extensions, e.g. ['.yaml', '.yml']
  abstract load(content: string): Record<string, unknown>;
}
```

Built-in (touched by config module internally): `JsonLoader`, `YamlLoader`, `TomlLoader`.

Third-party loaders are added via `@Touch`:

```ts
@Component()
class EnvFileLoader extends Loader {
  supports() { return ['.env']; }
  load(content: string) { return dotenv.parse(content); }
}

@Component()
@Touch(EnvFileLoader)
class AppModule {}
```

Config module uses `injectAll(Loader)` to discover all loaders at resolution time.

## 5. Resolver (pluggable variable resolvers)

```ts
@Component()
abstract class Resolver {
  abstract prefix(): string;    // for ${prefix:key} syntax
  abstract resolve(key: string): Awaitable<string | undefined>;
}
```

Built-in (touched by config module internally): `EnvResolver` (resolves `${env:KEY}`).

Custom resolvers are `@Component` classes added via `@Touch`. They can inject bootstrap options but NOT regular config schemas (which haven't loaded yet).

```ts
@Component()
class AwsResolver extends Resolver {
  private readonly client: SecretsManagerClient;

  constructor(opts = inject(AwsResolverOptions)) {
    super();
    this.client = new SecretsManagerClient(opts);
  }

  prefix() { return 'aws'; }

  async resolve(key: string) {
    const result = await this.client.getSecretValue({ SecretId: key });
    return result.SecretString;
  }
}
```

Config module uses `injectAll(Resolver)` to discover all resolvers at resolution time.

## 6. Bootstrap options

Options needed before config files load (ConfigOptions, AwsResolverOptions). Resolved from env/cli only.

```ts
declare function createBootstrapOption<T>(prefix: string, parser: ConfigParser<T>): Token<T>;
```

Env mapping: prefix uppercased, dots become underscores. `'aws'` → `AWS_REGION`.
CLI mapping: prefix as-is with `--` prepended. `'aws'` → `--aws.region`.

Precedence (highest → lowest):
1. **@Provide** — bypasses resolution (testing escape hatch)
2. **CLI arguments**
3. **Environment variables**
4. **@Decorate** — code-level defaults
5. **Schema defaults**

```ts
const AwsResolverOptions = createBootstrapOption('aws', z.object({
  region: z.string().default('us-east-1'),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
}));
```

`ConfigOptions` is a built-in bootstrap option (`createBootstrapOption('config', ...)`):

```ts
interface ConfigOptions {
  configFiles: string[];  // glob patterns, first match per element
  env: Record<string, string>;
  argv: string[];
  envPrefix: string;
  argvPrefix: string;     // without '--'
}
```

Defaults: `configFiles=['config.{yaml,yml,json,toml}']`, `env=process.env`, `argv=process.argv`, empty prefixes.

## 7. Config schema

```ts
declare function createConfigSchema<T>(prefix: string, parser: ConfigParser<T>): Token<T>;
```

Precedence (highest → lowest):
1. **@Provide** — bypasses resolution (testing escape hatch)
2. **CLI arguments** (`--{argvPrefix}{key}`)
3. **Environment variables** (`{envPrefix}{KEY}`)
4. **Config files** (first glob match per element)
5. **@Decorate** — code-level defaults
6. **Schema defaults**

```ts
const DatabaseConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  host: z.string(),
  port: z.coerce.number().default(5432),
  password: z.string(),
}));
```

## 8. Variable substitution

After source merging, before parsing. Applied to string values only.

| Syntax | Behavior |
|---|---|
| `${key}` | Config cross-reference, then env |
| `${prefix:key}` | Delegate to Resolver with matching prefix |
| `${key:-default}` | Use default if unresolved |
| `${prefix:key:-default}` | External with default |

- Unresolved without default → `ConfigValidationError`
- Circular references → `ConfigValidationError`
- Use `z.coerce.*()` for non-string target types

```yaml
database:
  host: "${DATABASE_HOST:-localhost}"
  password: "${aws:prod/db-password}"
  url: "postgres://${database.host}:${database.port}"
```

## 9. ConfigRegistry (internal)

Loads all config sources (files via Loaders, env, argv), resolves `${...}` via Resolvers, stores merged key-value store. Config tokens depend on it. Users don't interact with it directly.

## 10. Validation & failure

- Missing required values → `ConfigValidationError`
- Parser/validation errors → `ConfigValidationError` with prefix and details
- Unresolved `${...}` → `ConfigValidationError`
- Circular variable references → `ConfigValidationError`

## 11. Full example

```ts
import {
  Container, Component, Touch, Use, Decorate,
  inject, injectAll, token,
} from 'kavri';
import {
  createConfigSchema, createBootstrapOption, ConfigOptions,
  Resolver, Loader,
} from 'kavri/config';
import { z } from 'zod';

// --- bootstrap options (resolved before config files) ---

const AwsResolverOptions = createBootstrapOption('aws', z.object({
  region: z.string().default('us-east-1'),
}));

// --- custom resolver ---

@Component()
class AwsResolver extends Resolver {
  private readonly client: any;
  constructor(opts = inject(AwsResolverOptions)) {
    super();
    this.client = {}; // new SecretsManagerClient(opts)
  }
  prefix() { return 'aws'; }
  async resolve(key: string) { return 'secret-value'; }
}

// --- custom loader ---

@Component()
class EnvFileLoader extends Loader {
  supports() { return ['.env']; }
  load(content: string) { return {}; }
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

// --- driver selection ---

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

@Component()
@Touch(PsqlDriver)
@Touch(AwsResolver, EnvFileLoader)
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['config/app.yaml'],
  envPrefix: 'MYAPP_',
}))
class Application {
  constructor(
    private readonly app = inject(AppConfig),
    private readonly driver = inject(SelectedDriver),
  ) {}

  async run() {
    console.log(`${this.app.name}: ${await this.driver.query('select 1')}`);
  }
}

const container = new Container();
const app = await container.resolve(Application);
await app.run();
await container.destroy();
```

# Configuration Design

## 1. Position

Configuration is a first-class subsystem because it controls provider behavior, selector decisions, and dynamic registry resolution.

## 2. Goals

- typed config schemas
- multi-source loading
- deterministic precedence
- class-validator and zod style support
- safe integration with IoC selection APIs

## 3. Source precedence

From highest to lowest:

1. runtime override
2. CLI args
3. environment variables
4. config files (`yaml/json/toml`)
5. defaults

## 4. API proposal

```ts
ConfigModule.from({
  files: ['application.yaml', 'application.local.yaml'],
  envPrefix: 'APP',
  cli: process.argv,
  profile: process.env.APP_PROFILE ?? 'default',
  strictUnknownKeys: true,
});
```

## 5. Schema styles

### 5.1 class-validator style

```ts
@ConfigSchema('app.server')
class ServerConfig {
  @IsNumber()
  port = 3000;

  @IsString()
  host = '0.0.0.0';
}
```

### 5.2 zod style

```ts
const ServerConfig = defineZodConfig('app.server', z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
}));
```

## 6. IoC integration helpers

```ts
const cfg = injectConfig(ServerConfig);
const SelectedPetToken = configSelector('pet.selector', Pet, PetConfig, 'selectedPet');
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

## 7. Failure semantics

Startup fails on:

- missing required value
- parsing failure
- validation failure
- unknown strict key
- registry/selector key not found

Errors include path, source, and suggestion.

## 8. Full example (config-driven app)

```ts
import { Container, registry, token, injectConfig, inject } from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
import { z } from 'zod';

const AppConfig = defineZodConfig('app', z.object({
  mode: z.enum(['dev', 'prod']).default('dev'),
}));

const DatabaseConfig = defineZodConfig('database', z.object({
  driver: z.enum(['psql', 'mysql']),
  url: z.string(),
}));

interface Driver { connect(url: string): Promise<void>; }
class PsqlDriver implements Driver { async connect(url: string) { console.log('psql', url); } }
class MysqlDriver implements Driver { async connect(url: string) { console.log('mysql', url); } }

const DriverRegistry = registry<Driver>('database.driver');
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);

class Bootstrap {
  constructor(
    private readonly appCfg = injectConfig(AppConfig),
    private readonly dbCfg = injectConfig(DatabaseConfig),
    private readonly driver = inject(DriverToken),
  ) {}

  async start() {
    await this.driver.connect(this.dbCfg.url);
    console.log(`mode=${this.appCfg.mode}`);
  }
}

const container = new Container();
container.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
registerPsql(container);
registerMysql(container);

await container.validate();
await container.resolve(Bootstrap).then((b) => b.start());
```

# Configuration Design

## 1. Position

Configuration is a first-class subsystem because it controls provider factories, selectors, and registries.

## 2. Types used in this document

```ts
type ConfigSchema<T> = { key: string; parse(input: unknown): T };
type Constructor<T> = abstract new () => T;
interface Token<T> { kind: 'token'; name: string; }
interface ModuleRef { kind: 'module'; name: string; }

declare function defineZodConfig<T>(key: string, schema: unknown): ConfigSchema<T>;
declare function ConfigSchema(key: string): ClassDecorator;

declare class ConfigModule {
  static from(options: {
    files?: string[];
    envPrefix?: string;
    cli?: string[];
    profile?: string;
    strictUnknownKeys?: boolean;
  }): ModuleRef;
}

declare function injectConfig<T>(schema: ConfigSchema<T>): T;
declare function configSelector<TBase, TCfg>(
  name: string,
  base: Constructor<TBase>,
  schema: ConfigSchema<TCfg>,
  field: keyof TCfg,
): Token<TBase>;
declare function configRegistry<TCfg>(
  registryName: string,
  schema: ConfigSchema<TCfg>,
  field: keyof TCfg,
): Token<any>;
```

## 3. Source precedence

1. runtime override
2. CLI args
3. environment variables
4. config files (`yaml/json/toml`)
5. defaults

## 4. Validation styles

- class-validator style via decorator schema classes
- zod style via schema constructors

## 5. Failure semantics

Startup should fail for missing required values, parse/validation errors, or selector/registry key mismatches.

## 6. Full example

```ts
import { Container, ModuleRef, token, registry, inject, injectConfig, Constructor, Token } from '@kavri/core';
import { ConfigModule, defineZodConfig, configRegistry } from '@kavri/config';
import { z } from 'zod';

type Driver = { connect(url: string): Promise<void> };

const AppConfig = defineZodConfig('app', z.object({
  mode: z.enum(['dev', 'prod']).default('dev'),
}));

const DatabaseConfig = defineZodConfig('database', z.object({
  driver: z.enum(['psql', 'mysql']),
  url: z.string(),
}));

class PsqlDriver implements Driver { async connect(url: string) { console.log('psql', url); } }
class MysqlDriver implements Driver { async connect(url: string) { console.log('mysql', url); } }

const DriverRegistry = registry<Driver>('database.driver');
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
const LoggerToken = token<{ info(msg: string): void }>('logger', () => ({ info: console.log }));

class Bootstrap {
  constructor(
    private readonly appCfg = injectConfig(AppConfig),
    private readonly dbCfg = injectConfig(DatabaseConfig),
    private readonly driver = inject(DriverToken),
    private readonly logger = inject(LoggerToken),
  ) {}

  async start() {
    await this.driver.connect(this.dbCfg.url);
    this.logger.info(`mode=${this.appCfg.mode}`);
  }
}

const container = new Container();
container.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
registerPsql(container);
registerMysql(container);

const boot = await container.resolve(Bootstrap);
await boot.start();
await container.destroy();
```

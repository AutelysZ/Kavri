# 0x IoC Core Design

## 1. Scope

This document defines a complete IoC-first API surface with explicit dependencies and config-aware provider selection.

## 2. Canonical type declarations

All referenced API types are declared here for clarity.

```ts
export type Constructor<T> = abstract new (...args: any[]) => T;

export type TokenLike<T> = Token<T> | Constructor<T>;

export interface Token<T> {
  readonly kind: 'token';
  readonly name: string;
}

export interface ModuleRef {
  readonly kind: 'module';
  readonly name: string;
}

export interface ScopeRef {
  readonly kind: 'scope';
  readonly name: string;
  resolve<T>(target: TokenLike<T>): Promise<T>;
  destroy(): Promise<void>;
}

export type ProviderFactory<T> = (...deps: any[]) => T | Promise<T>;

export interface ClassProvider<T> {
  provide: TokenLike<T>;
  useClass: Constructor<T>;
  scope?: 'singleton' | 'scoped' | 'transient';
}

export interface ValueProvider<T> {
  provide: TokenLike<T>;
  useValue: T;
}

export interface FactoryProvider<T> {
  provide: TokenLike<T>;
  useFactory: ProviderFactory<T>;
  scope?: 'singleton' | 'scoped' | 'transient';
  onInit?: (value: T) => void | Promise<void>;
  onDestroy?: (value: T) => void | Promise<void>;
}

export interface ExistingProvider<T> {
  provide: TokenLike<T>;
  useExisting: TokenLike<T>;
}

export type Provider<T = unknown> =
  | ClassProvider<T>
  | ValueProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>;

export type ProviderInput =
  | Provider
  | Constructor<any>
  | readonly Constructor<any>[]
  | readonly Provider[];

export type ConfigSchema<T> = { key: string; parse(input: unknown): T };

export interface Registry<T> {
  register(name: string, impl: Constructor<T>): (container: Container) => void;
  get(name: string): Constructor<T> | undefined;
  getOrThrow(name: string): Constructor<T>;
}
```

## 3. Decorators and injection APIs

```ts
declare function Component(): ClassDecorator;
declare function token<T>(name: string, factory?: ProviderFactory<T>): Token<T>;
declare function selector<TBase>(
  name: string,
  base: Constructor<TBase>,
  select: (map: Map<string, Constructor<TBase>>, ...deps: any[]) => Constructor<TBase> | undefined,
): Token<TBase>;
declare function registry<T>(name: string): Registry<T>;
declare function Named(name: string): ClassDecorator;

declare function inject<T>(target: TokenLike<T>): T;
declare function injectOptional<T>(target: TokenLike<T>): T | undefined;
declare function injectLazy<T>(target: TokenLike<T>): () => Promise<T>;
declare function injectNamed<T>(base: Constructor<T>, name: string): T;
declare function injectConfig<T>(schema: ConfigSchema<T>): T;
```

No chained methods on `inject`.

## 4. Container API (restricted)

```ts
class Container {
  provide(...inputs: ProviderInput[]): this;
  use(module: ModuleRef): this;
  createScope(name?: string): ScopeRef;
  resolve<T>(target: TokenLike<T>): Promise<T>;
  destroy(): Promise<void>;
}
```

Only `resolve(...)` is used to obtain instances.

## 5. Provider categories

### 5.1 Component provider

```ts
@Component()
class UserService {}
```

### 5.2 Token provider

```ts
const SequelizeToken = token<Sequelize>('sequelize',
  (cfg = injectConfig(SequelizeConfig)) => new Sequelize(cfg.url),
);
```

### 5.3 Conditional selector provider (constructor map)

```ts
@Component()
abstract class Pet {}

@Named('dog')
class Dog extends Pet {}

@Named('cat')
class Cat extends Pet {}

const AllPets = [Dog, Cat];

const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Constructor<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);
```

Conditional selection must use constructors/providers map to avoid eager instantiation.

### 5.4 Dynamic registry provider

```ts
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);

const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => new (DriverRegistry.getOrThrow(cfg.driver))(),
);
```

## 6. Scopes and lifecycle

- `singleton`: container lifetime
- `scoped`: child scope lifetime
- `transient`: resolution lifetime

Lifecycle order:

1. provider created
2. optional `onInit` / `@PostConstruct`
3. on scope/container teardown: `onDestroy` / `@BeforeDestroy` in reverse dependency order

## 7. Full example

```ts
import {
  Container,
  Component,
  Named,
  token,
  selector,
  registry,
  inject,
  injectOptional,
  injectLazy,
  injectNamed,
  injectConfig,
} from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
import { z } from 'zod';

// -------- config schemas --------
const PetConfig = defineZodConfig('pet', z.object({ selectedPet: z.enum(['dog', 'cat']) }));
const DatabaseConfig = defineZodConfig('database', z.object({ driver: z.enum(['psql', 'mysql']) }));

// -------- component providers --------
@Component()
abstract class Pet { abstract speak(): string; }

@Named('dog')
class Dog extends Pet { speak() { return 'woof'; } }

@Named('cat')
class Cat extends Pet { speak() { return 'meow'; } }

const AllPets = [Dog, Cat];

const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Constructor<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);

// -------- dynamic registry --------
interface Driver { query(sql: string): Promise<string>; }
class PsqlDriver implements Driver { async query(sql: string) { return `psql:${sql}`; } }
class MysqlDriver implements Driver { async query(sql: string) { return `mysql:${sql}`; } }

const DriverRegistry = registry<Driver>('database.driver');
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => new (DriverRegistry.getOrThrow(cfg.driver))(),
);

const MetricsClientToken = token<{ emit(name: string): void }>('metrics.client');
const LoggerToken = token<{ info(data: unknown): void }>('logger');

@Component()
class AppService {
  constructor(
    private readonly selectedPet = inject(PetSelector),
    private readonly driver = inject(DriverToken),
    private readonly maybeMetrics = injectOptional(MetricsClientToken),
    private readonly lazyLogger = injectLazy(LoggerToken),
  ) {}

  async run() {
    const namedDog = injectNamed(Pet, 'dog');
    const db = await this.driver.query('select 1');
    const logger = await this.lazyLogger();
    logger.info({ db, namedDog: namedDog.speak(), hasMetrics: !!this.maybeMetrics });
    return `${this.selectedPet.speak()} | ${db}`;
  }
}

const app = new Container();
app.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
app.provide(AllPets);
registerPsql(app);
registerMysql(app);

const service = await app.resolve(AppService);
console.log(await service.run());
await app.destroy();
```

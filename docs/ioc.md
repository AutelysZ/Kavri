# IoC Core Design

## 1. Scope and goals

This document defines the core IoC runtime and API. It should be complete enough to support:

- small scripts and services (`new Container().resolve(Foo)`)
- large applications with modules and scoped lifecycles
- config-driven implementation selection
- optional upper layers (HTTP, job workers, CLI)

## 2. Provider model (canonical)

Kavri supports four practical provider forms grouped into three categories.

### 2.1 Component providers

A class decorated with `@Component()` (or a higher-order decorator embedding it) is directly resolvable.

```ts
@Component()
class UserService {
  constructor(private readonly repo = inject(UserRepo)) {}
}
```

### 2.2 Token providers

For external values/classes/factories.

```ts
const RedisToken = token<RedisClient>('redis');

container.provide({
  provide: RedisToken,
  useFactory: (cfg = injectConfig(RedisConfig)) => createRedis(cfg.url),
  onInit: (r) => r.connect(),
  onDestroy: (r) => r.quit(),
});
```

### 2.3 Conditional/selector providers

For polymorphic resolution without eager instantiation of all candidates.

```ts
@Component()
abstract class Pet {}

@Named('dog')
class Dog extends Pet {}

@Named('cat')
class Cat extends Pet {}

container.provide([Dog, Cat]);

const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Provider<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);
```

### 2.4 Registry providers

For dynamic ecosystem integrations (drivers/adapters/plugins).

```ts
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
export const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);
```

## 3. Key principle: instantiate only what is selected

When conditional logic is used, container should avoid creating all candidates.

- selector receives constructor/provider map
- selector returns selected provider entry
- container instantiates only selected target

This keeps startup lean and avoids hidden side effects.

## 4. Container API proposal

```ts
class Container {
  // registration
  provide(...inputs: ProviderInput[]): this; // class, provider object, arrays
  use(module: ModuleRef): this;

  // resolution
  get<T>(token: TokenLike<T>): T; // no lifecycle
  resolve<T>(token: TokenLike<T>): Promise<T>; // lifecycle-aware
  resolveAll<T>(base: TokenLike<T>): Promise<readonly T[]>;

  // collection helpers
  injectList<T>(base: TokenLike<T>, options?: { orderBy?: 'provided' | 'topo' }): readonly T[];
  injectMap<T>(base: TokenLike<T>): ReadonlyMap<string, T>;
  injectSet<T>(base: TokenLike<T>): ReadonlySet<T>;

  // safety and diagnostics
  has(token: TokenLike<unknown>): boolean;
  override<T>(token: TokenLike<T>, provider: Provider<T>): this;
  validate(options?: ValidationOptions): Promise<void>;
  inspect(): DependencyGraph;

  // scopes and lifecycle
  createScope(name?: string): ScopedContainer;
  destroy(): Promise<void>;
}
```

## 5. Injection APIs

```ts
declare const inject: {
  <T>(token: TokenLike<T>): T;
  optional<T>(token: TokenLike<T>): T | undefined;
  lazy<T>(token: TokenLike<T>): () => Promise<T>;
  named<T>(base: TokenLike<T>, name: string): T;
};

declare function injectList<T>(base: TokenLike<T>, options?: { orderBy?: 'provided' | 'topo' }): readonly T[];
declare function injectMap<T>(base: TokenLike<T>): ReadonlyMap<string, T>;
declare function injectSet<T>(base: TokenLike<T>): ReadonlySet<T>;
declare function injectConfig<T>(schema: ConfigSchema<T>): T;
```

## 6. Scope and lifecycle semantics

### Scopes

- `singleton`: cached in root container
- `scoped`: cached per child scope
- `transient`: never cached

### Lifecycle

- `resolve(...)`: triggers `onInit` / `@PostConstruct`
- `get(...)`: no lifecycle hook execution
- `destroy()`: reverse-order `onDestroy` / `@BeforeDestroy`

Strict validation should reject singleton -> scoped unsafe dependency edges.

## 7. Error model

- `ResolutionError`
- `ProviderConflictError`
- `CircularDependencyError`
- `ScopeViolationError`
- `DynamicProviderNotFoundError`
- `LifecycleError`

Every error should include dependency path and source token.

## 8. Full example (IoC-first app)

```ts
import {
  Container,
  Component,
  Named,
  token,
  selector,
  registry,
  inject,
  injectConfig,
} from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
import { z } from 'zod';

// ---------- config ----------
const PetConfig = defineZodConfig('pet', z.object({ selectedPet: z.enum(['dog', 'cat']) }));
const DatabaseConfig = defineZodConfig('database', z.object({ driver: z.enum(['psql', 'mysql']) }));

// ---------- polymorphic components ----------
@Component()
abstract class Pet {
  abstract speak(): string;
}

@Named('dog')
class Dog extends Pet {
  speak() {
    return 'woof';
  }
}

@Named('cat')
class Cat extends Pet {
  speak() {
    return 'meow';
  }
}

// Explicit class registration group
const AllPets = [Dog, Cat];

const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Provider<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);

// ---------- dynamic registry ----------
interface Driver { query(sql: string): Promise<unknown>; }
class PsqlDriver implements Driver { async query(sql: string) { return `psql:${sql}`; } }
class MysqlDriver implements Driver { async query(sql: string) { return `mysql:${sql}`; } }

const DriverRegistry = registry<Driver>('database.driver');
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = token<Driver>(
  'database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);

// ---------- app service ----------
@Component()
class AppService {
  constructor(
    private readonly pet = inject(PetSelector),
    private readonly driver = inject(DriverToken),
  ) {}

  async run() {
    const result = await this.driver.query('select 1');
    return `${this.pet.speak()} | ${result}`;
  }
}

// ---------- bootstrap ----------
const app = new Container();
app.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
app.provide(AllPets);
registerPsql(app); // only register what app intends to support
registerMysql(app);

await app.validate();
const service = await app.resolve(AppService);
console.log(await service.run());
await app.destroy();
```

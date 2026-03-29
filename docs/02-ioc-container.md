# 02. IoC Container API

## Core design center

Kavri provider design should be explicit and complete around **three provider categories**.

## 1) Component providers (declared classes)

A class decorated with `@Component()` (or higher-order decorators that include `@Component`) is a provider by itself.

```ts
@Component()
class UserService {
  constructor(private readonly repo = inject(UserRepo)) {}
}

const userService = await container.resolve(UserService);
```

### Named component variants (simplified)

```ts
@Component()
abstract class Pet {}

@Named('dog')
class Dog extends Pet {}

@Named('cat')
class Cat extends Pet {}
```

`@Named(...)` should infer base category from inheritance (`Dog extends Pet`), so `@Named(Pet, 'dog')` is not required.

---

## 2) Token providers (external classes, values, factories)

Use tokens for:

- external/non-decorated classes
- primitive values
- factories requiring dependencies/config
- custom lifecycle hooks

### Token declaration

```ts
const SequelizeToken = token<Sequelize>('sequelize',
  (config = injectConfig(SequelizeConfig)) => new Sequelize(config.url),
);
```

If token is declared **without factory**, user must provide it explicitly.

```ts
const RedisToken = token<RedisClient>('redis');

container.provide({
  provide: RedisToken,
  useFactory: (cfg = injectConfig(RedisConfig)) => createRedis(cfg.url),
  onDestroy: (client) => client.quit(),
});
```

---

## 3) Conditional, collection, and dynamic providers

### 3.1 Register component group explicitly

Classes must still be provided to container (especially when declared in other files):

```ts
const AllPets = [Dog, Cat];
container.provide(AllPets);
```

### 3.2 Collection injection APIs (runtime instances)

Collections are **injected directly**, not declared as collection tokens.

```ts
const allPets = injectList(Pet);          // readonly Pet[]
const petMap = injectMap(Pet);            // ReadonlyMap<string, Pet>
const petSet = injectSet(Pet);            // ReadonlySet<Pet>
```

Optional ordering can be supported:

```ts
const ordered = injectList(Pet, { orderBy: 'topo' });
```

### 3.3 Selector API (constructor map, lazy instantiate)

For conditional selection, inject a map of **constructors/providers**, not instances.
This avoids instantiating all candidates.

```ts
const PetSelector = selector(
  'pet.selector',
  Pet,
  (map: Map<string, Provider<Pet>>, cfg = injectConfig(PetConfig)) => map.get(cfg.selectedPet),
);
```

Resolution behavior:

1. selector chooses provider by key
2. container instantiates only the selected one
3. missing key produces clear startup/runtime error

### 3.4 Registry for dynamic implementations

```ts
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
export const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);
```

If config asks for `mssql` but only `registerPsql()` was called, startup should fail with a clear error.

### 3.5 Helper reducers (proposed)

```ts
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
const SelectedPetToken = configSelector('pet.selector', Pet, PetConfig, 'selectedPet');
```

---

## Provider capability matrix

| Capability | Component | Token | Selector/Conditional | Registry |
|---|---:|---:|---:|---:|
| Declared by class | ✅ | ❌ | ⚠️ (uses class group) | ❌ |
| External value | ❌ | ✅ | ⚠️ | ❌ |
| Factory | ⚠️ | ✅ | ✅ | ✅ |
| Lifecycle hooks | ✅ | ✅ | ✅ (selected only) | ✅ (selected only) |
| Config-aware | ⚠️ | ✅ | ✅ | ✅ |
| Lazy instantiate selected only | ❌ | ⚠️ | ✅ | ✅ |
| Dynamic by key | ❌ | ⚠️ | ✅ | ✅ |

---

## Container API proposal

```ts
class Container {
  // registration
  provide(...providers: ProviderInput[]): this; // supports class, token provider, arrays
  use(module: ModuleRef): this;

  // resolution ergonomics
  get<T>(token: TokenLike<T>): T; // instantiate only, no lifecycle
  resolve<T>(token: TokenLike<T>): Promise<T>; // full lifecycle
  resolveAll<T>(base: TokenLike<T>): Promise<readonly T[]>;

  // collection resolution helpers
  injectList<T>(base: TokenLike<T>, options?: { orderBy?: 'provided' | 'topo' }): readonly T[];
  injectMap<T>(base: TokenLike<T>): ReadonlyMap<string, T>;
  injectSet<T>(base: TokenLike<T>): ReadonlySet<T>;

  // utility
  has(token: TokenLike<unknown>): boolean;
  createScope(name?: string): ScopedContainer;
  override<T>(token: TokenLike<T>, provider: Provider<T>): this;

  // safety
  validate(options?: ValidationOptions): Promise<void>;
  inspect(): DependencyGraph;

  destroy(): Promise<void>;
}
```

## Injection helpers

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

## Lifecycle semantics

- `resolve(...)` triggers `onInit`/`@PostConstruct`.
- `get(...)` skips lifecycle intentionally.
- selector/registry instantiate only selected target.
- `destroy()` triggers `onDestroy`/`@BeforeDestroy` in reverse dependency order.

## Scope rules

- `singleton`: root cache.
- `scoped`: per child-scope cache.
- `transient`: no cache.

Strict validation should reject unsafe singleton -> scoped dependency edges.

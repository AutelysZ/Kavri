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

### Named component variants

```ts
abstract class Pet {}

@Named(Pet, 'dog')
class Dog extends Pet {}

@Named(Pet, 'cat')
class Cat extends Pet {}
```

Use class directly for injection/registration.

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

If token is declared **without factory**, user must provide a provider explicitly.

```ts
const RedisToken = token<RedisClient>('redis');

container.provide({
  provide: RedisToken,
  useFactory: (cfg = injectConfig(RedisConfig)) => createRedis(cfg.url),
  onDestroy: (client) => client.quit(),
});
```

### External value and alias

```ts
container.provide({ provide: AppNameToken, useValue: 'kavri-app' });
container.provide({ provide: LoggerToken, useExisting: PinoLoggerToken });
```

---

## 3) Conditional, collection, and dynamic providers

This category supports feature-rich runtime selection patterns.

### 3.1 Collection token

```ts
const AllPetToken = token<Pet[]>('pets.all', [Dog, Cat]);
```

### 3.2 Config-driven selection from collection

```ts
const SelectedPetToken = token<Pet>('pets.selected',
  (cfg = injectConfig(PetConfig), all = inject(AllPetToken)) => {
    const selected = all.find((p) => p.name === cfg.selectedPet);
    if (!selected) throw new Error(`Unknown pet: ${cfg.selectedPet}`);
    return selected;
  },
);
```

### 3.3 Registry for dynamic providers

Registry is a helper for keyed dynamic implementations (drivers, plugins, handlers).

```ts
const DriverRegistry = registry<Driver>('database.driver');
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
export const registerMysql = DriverRegistry.register('mysql', MysqlDriver);
```

Then resolve selected implementation via token:

```ts
const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);
```

If config asks for `mssql` but only `registerPsql()` was called, startup should fail with a clear error.

### 3.4 Combined helper patterns (proposed)

To reduce boilerplate, provide helpers:

```ts
const SelectedPetToken = configToken('pets.selected', PetConfig, 'selectedPet');
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

Equivalent lower-level form:

```ts
const DriverRegistry = registry<Driver>('database.driver',
  (r, cfg = injectConfig(DatabaseConfig)) => r.getOrThrow(cfg.driver),
);
```

Proposed signature:

```ts
registry<T>(
  name: string,
  provider?: (registry: Registry<T>) => TokenLike<T> | T,
): RegistryToken<T>;
```

---

## Provider capability matrix

| Capability | Component | Token | Collection/Conditional | Registry |
|---|---:|---:|---:|---:|
| Declared by class | ✅ | ❌ | ⚠️ (uses class list) | ❌ |
| External value | ❌ | ✅ | ✅ | ❌ |
| Factory | ⚠️ | ✅ | ✅ | ✅ |
| Lifecycle hooks | ✅ | ✅ | ✅ | ⚠️ (via selected token) |
| Config-aware | ⚠️ | ✅ | ✅ | ✅ |
| Lazy / optional | ✅ | ✅ | ✅ | ✅ |
| Dynamic by key | ❌ | ⚠️ | ✅ | ✅ |

---

## Container API proposal

```ts
class Container {
  // registration
  provide(...providers: Provider<any>[]): this;
  use(module: ModuleRef): this;

  // resolution ergonomics
  get<T>(token: TokenLike<T>): T; // instantiate only, no lifecycle
  resolve<T>(token: TokenLike<T>): Promise<T>; // full lifecycle
  resolveAll<T>(token: TokenLike<T>): Promise<T[]>;

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
const inject: {
  <T>(token: TokenLike<T>): T;
  optional<T>(token: TokenLike<T>): T | undefined;
  all<T>(token: TokenLike<T>): T[];
  lazy<T>(token: TokenLike<T>): () => Promise<T>;
  named<T>(base: TokenLike<T>, name: string): T;
};

declare function injectConfig<T>(schema: ConfigSchema<T>): T;
```

## Lifecycle semantics

- `resolve(...)` triggers `onInit`/`@PostConstruct`.
- `get(...)` skips lifecycle intentionally.
- `destroy()` triggers `onDestroy`/`@BeforeDestroy` in reverse dependency order.

## Scope rules

- `singleton`: root cache.
- `scoped`: per child-scope cache.
- `transient`: no cache.

Strict validation should reject unsafe singleton -> scoped dependency edges.

# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API with explicit provider registration, conditional selection, and deterministic lifecycle behavior.

## 2. Canonical type declarations

All key types used by the IoC API are declared here.

```ts
export type Constructor<T> = abstract new () => T;

export interface Token<T> {
  readonly kind: 'token';
  readonly id: symbol;
  provide: Provider<T> | undefined;
}

export type SelectorExtractor<T> = () => TokenLike<T> | undefined;

export interface SelectorToken<T> {
  readonly kind: 'selector-token';
  readonly id: symbol;
  extractor: SelectorExtractor<T>;
}

export interface CollectionToken<T> {
  readonly kind: 'collection-token';
  readonly id: symbol;
  get(name: string | symbol): Constructor<T> | undefined;
  set(): ReadonlySet<Constructor<T>>;
  map(): ReadonlyMap<string | symbol, Constructor<T>>;
  list(options?: CollectionListOptions): readonly Constructor<T>[]; // default order: 'provided'
}

export type TokenLike<T> = Token<T> | SelectorToken<T> | Constructor<T>;

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

export type ProviderFactory<T> = () => T | Promise<T>;

export interface ValueProvider<T> {
  useValue: T;
}

export interface FactoryProvider<T> {
  useFactory: ProviderFactory<T>;
  scope?: 'singleton' | 'scoped' | 'transient';
  onInit?: (value: T) => void | Promise<void>;
  onDestroy?: (value: T) => void | Promise<void>;
}

export type Provider<T = unknown> = ValueProvider<T> | FactoryProvider<T>;

export interface Registry<T> {
  register(name: string, impl: Constructor<T>): () => void;
  get(name: string): Constructor<T> | undefined;
  getOrThrow(name: string): Constructor<T>;
}

type LegacyClassDecorator = (target: Function) => void | Function;
interface TC39ClassDecoratorContext {
  kind: 'class';
  name: string;
}
type TC39ClassDecorator = (value: Function, context: TC39ClassDecoratorContext) => Function | void;
export type HybridClassDecorator = LegacyClassDecorator & TC39ClassDecorator;
export type ProviderScope = 'singleton' | 'scoped' | 'transient';
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

export interface CollectionListOptions {
  order?: CollectionOrder;
}

export interface ComponentOptions {
  name?: string | symbol;
  scope?: ProviderScope;
  predicate?: () => boolean;
}
```

## 3. Decorators and injection APIs

```ts
declare function Component(options?: ComponentOptions): HybridClassDecorator;

declare function token<T>(provider?: Provider<T>): Token<T>;
declare function collection<T>(
  constructors: readonly Constructor<T>[],
  options?: CollectionListOptions,
): CollectionToken<T>;
declare function selector<T>(
  extractor: SelectorExtractor<T>,
): SelectorToken<T>;
declare function registry<T>(): Registry<T>;

declare function inject<T>(target: TokenLike<T>): T;
declare function injectOptional<T>(target: TokenLike<T>): T | undefined;

declare function injectLazy<T>(target: TokenLike<T>): Promise<T>;
declare function injectOptionalLazy<T>(target: TokenLike<T>): Promise<T | undefined>;

declare function injectNamed<T>(collection: CollectionToken<T>, name: string | symbol): T;
declare function injectOptionalNamed<T>(collection: CollectionToken<T>, name: string | symbol): T | undefined;
declare function injectAll<T>(decorator: ClassDecorator): readonly T[];

declare function injectMap<T>(collection: CollectionToken<T>): ReadonlyMap<string | symbol, T>;
declare function injectSet<T>(collection: CollectionToken<T>): ReadonlySet<T>;
declare function injectList<T>(
  collection: CollectionToken<T>,
  options?: CollectionListOptions,
): readonly T[];
```

Notes:

- No chained methods on `inject`.
- Optional injection is exposed via dedicated `injectOptionalXxx(...)` APIs (no options object).
- `inject*` APIs may only be used in constructor parameter defaults, `selector(...)` extractors, and token/class lifecycle default parameters.
- `selector(...)` extractor signature is strict: `() => TokenLike<T> | undefined`.
- `CollectionToken<T>` is not `TokenLike<T>` and cannot be resolved directly; it is only used with `injectMap`, `injectSet`, and `injectList`.
- `collection(...)` defaults to `'provided'` order when `options.order` is omitted.
- `collection(...)` validates named components at runtime and throws if a constructor is not decorated with `@Component({ name })`.

## 4. Container API

```ts
class Container {
  provide<T>(constructor: Constructor<T>): this;
  provide<T>(token: Token<T>, provider: Provider<T>): this;
  provide(entries: readonly (Constructor<any> | [Token<any>, Provider<any>])[]): this;
  use(module: ModuleRef): this;
  createScope(name?: string): ScopeRef;
  resolve<T>(target: TokenLike<T>): Promise<T>;
  destroy(): Promise<void>;
}
```

Only `resolve(...)` is used to obtain instances.
`provide(constructor)` is a no-op registration used to ensure constructor import/visibility.

## 5. Provider categories

### 5.1 Component provider (constructor directly)

```ts
@Component()
class UserService {}
```

### 5.2 Token provider

```ts
const SequelizeToken = token<Sequelize>({
  useFactory: () => new Sequelize('postgres://localhost/example'),
});
```

### 5.3 Collection + conditional selector provider

```ts
@Component()
abstract class Pet {}

const PET_DOG = Symbol('dog');

@Component({ name: PET_DOG })
class Dog extends Pet {}

@Component({ name: 'cat' })
class Cat extends Pet {}

const PetCollection = collection<Pet>([Dog, Cat], { order: 'provided' });
const SelectedPetName: string | symbol = 'cat';

const PetSelector = selector(
  () => PetCollection.get(SelectedPetName),
);
```

The selector is not bound to a single provider source and can extract from any runtime condition.
Named bindings are declared through `@Component({ name })` and support both `string` and `symbol`.
With `collection(...)`, `container.provide([Dog, Cat])` is not required for collection injection.
`container.provide(Dog)` / `container.provide(Cat)` are valid import-assurance calls when only named-resolution (`injectNamed(PetCollection, ...)`) paths are used.

### 5.4 Dynamic registry provider (selector-based)

```ts
const DriverRegistry = registry<Driver>();
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);

const DriverSelector = selector(
  () => DriverRegistry.get('psql'),
);
```

## 6. Scopes and lifecycle

- `singleton`: container lifetime
- `scoped`: child-scope lifetime
- `transient`: per-resolution lifetime

Lifecycle order:

1. provider created
2. optional `onInit` / `@PostConstruct`
3. `onDestroy` / `@BeforeDestroy` in reverse dependency order during scope/container destroy

## 7. Full example

```ts
import {
  Container,
  Component,
  token,
  collection,
  selector,
  registry,
  inject,
  injectOptional,
  injectMap,
  injectLazy,
  injectNamed,
} from '@kavri/core';

const SelectedPetName: string | symbol = 'cat';
const SelectedDriverName = 'psql';

@Component()
abstract class Pet { abstract speak(): string; }

const PET_DOG = Symbol('dog');

@Component({ name: PET_DOG })
class Dog extends Pet { speak() { return 'woof'; } }

@Component({ name: 'cat' })
class Cat extends Pet { speak() { return 'meow'; } }

const PetCollection = collection<Pet>([Dog, Cat], { order: 'provided' });

const PetSelector = selector(
  () => PetCollection.get(SelectedPetName),
);

interface Driver { query(sql: string): Promise<string>; }
class PsqlDriver implements Driver { async query(sql: string) { return `psql:${sql}`; } }
class MysqlDriver implements Driver { async query(sql: string) { return `mysql:${sql}`; } }

const DriverRegistry = registry<Driver>();
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverSelector = selector(
  () => DriverRegistry.get(SelectedDriverName),
);

const LoggerToken = token<{ info(data: unknown): void }>({
  useFactory: () => ({ info: console.log }),
});

const MetricsToken = token<{ emit(name: string): void }>();

@Component()
class AppService {
  constructor(
    private readonly selectedPet = inject(PetSelector),
    private readonly driver = inject(DriverSelector),
    private readonly pets = injectMap(PetCollection),
    private readonly maybeMetrics = injectOptional(MetricsToken),
    private readonly loggerPromise = injectLazy(LoggerToken),
    private readonly dog = injectNamed(PetCollection, PET_DOG),
  ) {}

  async run() {
    const db = await this.driver.query('select 1');
    const logger = await this.loggerPromise;
    logger.info({
      db,
      dog: this.dog.speak(),
      availablePets: Array.from(this.pets.keys()),
      hasMetrics: !!this.maybeMetrics,
    });
    return `${this.selectedPet.speak()} | ${db}`;
  }
}

registerPsql();
registerMysql();
const app = new Container();

const service = await app.resolve(AppService);
console.log(await service.run());
await app.destroy();
```

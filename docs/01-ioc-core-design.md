# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API with explicit provider registration, conditional selection, and deterministic lifecycle behavior.

## 2. Canonical type declarations

All key types used by the IoC API are declared here.

```ts
export type Constructor<T> = abstract new () => T;
export type AnyConstructor<T> = abstract new (...args: any[]) => T;
export type NoArgumentsMethodKeyof<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => any ? K : never
}[keyof T];

export class Token<T> {
  readonly defaultValue: T;
}

export type ComputedExtractor<T> = () => TokenLike<T> | undefined;

export class Computed<T> {
  readonly extractor: ComputedExtractor<T>;
}

export class Collection<T> {
  get(name: string | symbol): Constructor<T> | undefined;
  set(): ReadonlySet<Constructor<T>>;
  map(): ReadonlyMap<string | symbol, Constructor<T>>;
  list(options?: CollectionListOptions): readonly Constructor<T>[]; // default order: 'provided'
}

export type TokenLike<T> = Token<T> | Computed<T> | Constructor<T>;

export interface ModuleRef {
  readonly kind: 'module';
  readonly name: string;
}

export interface ModuleSpec {
  name: string;
  providers?: readonly Constructor<any>[];
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

type TC39ClassDecorator = (value: Function, context: ClassDecoratorContext) => Function | void;
export type HybridClassDecorator = ClassDecorator | TC39ClassDecorator;
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
declare function Provide<T>(
  constructor: AnyConstructor<T>,
  options?: {
    destroyMethod?: NoArgumentsMethodKeyof<T>;
    onDestroy?: (inst: T) => void | Promise<void>;
  },
): MethodDecorator;
declare function defineModule(spec: ModuleSpec): ModuleRef;

declare function token<T>(defaultValue: T): Token<T>;
declare function collection<T>(
  constructors: readonly Constructor<T>[],
  options?: CollectionListOptions,
): Collection<T>;
declare function computed<T>(
  extractor: ComputedExtractor<T>,
): Computed<T>;
declare function registry<T>(): Registry<T>;

declare function inject<T>(target: TokenLike<T>): T;
declare function injectOptional<T>(target: TokenLike<T>): T | undefined;

declare function injectLazy<T>(target: TokenLike<T>): Promise<T>;
declare function injectOptionalLazy<T>(target: TokenLike<T>): Promise<T | undefined>;

declare function injectNamed<T>(collection: Collection<T>, name: string | symbol): T;
declare function injectOptionalNamed<T>(collection: Collection<T>, name: string | symbol): T | undefined;
declare function injectAll<T>(decorator: ClassDecorator): readonly T[];

declare function injectMap<T>(collection: Collection<T>): ReadonlyMap<string | symbol, T>;
declare function injectSet<T>(collection: Collection<T>): ReadonlySet<T>;
declare function injectList<T>(
  collection: Collection<T>,
  options?: CollectionListOptions,
): readonly T[];
```

Notes:

- No chained methods on `inject`.
- Optional injection is exposed via dedicated `injectOptionalXxx(...)` APIs (no options object).
- `inject*` APIs may only be used in constructor parameter defaults, `computed(...)` extractors, and token/class lifecycle default parameters.
- `computed(...)` extractor signature is strict: `() => TokenLike<T> | undefined`.
- `Collection<T>` is not `TokenLike<T>` and cannot be resolved directly; it is only used with `injectMap`, `injectSet`, and `injectList`.
- `collection(...)` defaults to `'provided'` order when `options.order` is omitted.
- `collection(...)` validates named components at runtime and throws if a constructor is not decorated with `@Component({ name })`.
- External constructors are valid `TokenLike` targets for `inject*` and `container.provide(tokenLike, provider)`.

## 4. Container API

```ts
class Container {
  provide<T>(constructor: Constructor<T>): this;
  provide<T>(token: TokenLike<T>, provider: Provider<T>): this;
  provide(entries: readonly (Constructor<any> | [TokenLike<any>, Provider<any>])[]): this;
  use(module: ModuleRef): this;
  createScope(name?: string): ScopeRef;
  resolve<T>(target: TokenLike<T>): Promise<T>;
  destroy(): Promise<void>;
}
```

Only `resolve(...)` is used to obtain instances.
`provide(constructor)` is a no-op registration used to ensure constructor import/visibility.
`provide(tokenLike, provider)` accepts both `Token<T>` and external constructors (e.g. `Sequelize`) as registration keys.

## 5. Provider categories

### 5.1 Component provider (constructor directly)

```ts
@Component()
class UserService {}
```

### 5.2 Token provider

```ts
const SequelizeToken = token<Sequelize>(
  new Sequelize('postgres://localhost/example'),
);
```

### 5.3 Method provider via `@Provide(...)`

```ts
class DatabaseModule {
  @Provide(Sequelize)
  public getSequelize(): Sequelize {
    return new Sequelize('postgres://localhost/example');
  }
}
```

### 5.4 Collection + conditional computed provider

```ts
@Component()
abstract class Pet {}

const PET_DOG = Symbol('dog');

@Component({ name: PET_DOG })
class Dog extends Pet {}

@Component({ name: 'cat' })
class Cat extends Pet {}

const PetCollection = collection<Pet>([Dog, Cat], { order: 'provided' });
const SelectedPetNameToken = token<string | symbol>('cat');

const PetComputed = computed(
  () => PetCollection.get(inject(SelectedPetNameToken)),
);
```

The computed token is not bound to a single provider source and can extract from any runtime condition.
Named bindings are declared through `@Component({ name })` and support both `string` and `symbol`.
With `collection(...)`, `container.provide([Dog, Cat])` is not required for collection injection.
`container.provide(Dog)` / `container.provide(Cat)` are valid import-assurance calls when only named-resolution (`injectNamed(PetCollection, ...)`) paths are used.

### 5.5 Dynamic registry provider (computed-based)

```ts
const DriverRegistry = registry<Driver>();
export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
export const SelectedDriverNameToken = token<string>('psql');

const DriverComputed = computed(
  () => DriverRegistry.get(inject(SelectedDriverNameToken)),
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
  Provide,
  defineModule,
  token,
  collection,
  computed,
  registry,
  inject,
  injectOptional,
  injectMap,
  injectLazy,
  injectNamed,
} from '@kavri/core';

const SelectedPetNameToken = token<string | symbol>('cat');
const SelectedDriverNameToken = token<string>('psql');

@Component()
abstract class Pet { abstract speak(): string; }

const PET_DOG = Symbol('dog');

@Component({ name: PET_DOG })
class Dog extends Pet { speak() { return 'woof'; } }

@Component({ name: 'cat' })
class Cat extends Pet { speak() { return 'meow'; } }

const PetCollection = collection<Pet>([Dog, Cat], { order: 'provided' });

const PetComputed = computed(
  () => PetCollection.get(inject(SelectedPetNameToken)),
);

interface Driver { query(sql: string): Promise<string>; }
class Sequelize {
  constructor(public readonly url: string) {}
  close() {}
}
class PsqlDriver implements Driver { async query(sql: string) { return `psql:${sql}`; } }
class MysqlDriver implements Driver { async query(sql: string) { return `mysql:${sql}`; } }

const DriverRegistry = registry<Driver>();
const registerPsql = DriverRegistry.register('psql', PsqlDriver);
const registerMysql = DriverRegistry.register('mysql', MysqlDriver);

const DriverComputed = computed(
  () => DriverRegistry.get(inject(SelectedDriverNameToken)),
);

const LoggerToken = token<{ info(data: unknown): void }>({ info: console.log });

const MetricsToken = token<{ emit(name: string): void } | undefined>(undefined);

class DatabaseProviders {
  @Provide(Sequelize, { destroyMethod: 'close' })
  public getSequelize(): Sequelize {
    return new Sequelize('postgres://localhost/example');
  }
}

const DatabaseModule = defineModule({
  name: 'database',
  providers: [DatabaseProviders],
});

@Component()
class AppService {
  constructor(
    private readonly selectedPet = inject(PetComputed),
    private readonly driver = inject(DriverComputed),
    private readonly sequelize = inject(Sequelize),
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
      sequelizeUrl: this.sequelize.url,
      availablePets: Array.from(this.pets.keys()),
      hasMetrics: !!this.maybeMetrics,
    });
    return `${this.selectedPet.speak()} | ${db}`;
  }
}

registerPsql();
registerMysql();
const app = new Container();
app.use(DatabaseModule);

const service = await app.resolve(AppService);
console.log(await service.run());
await app.destroy();
```

# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API: explicit provider registration, injection via constructor default parameters, lifecycle hooks, metadata system, scoped containers, and deterministic async resolution.

## 2. Core types

```ts
export type Qualifier = string | symbol;
export type ProviderScope = 'singleton' | 'scoped' | 'transient';
export type Awaitable<T> = T | Promise<T>;
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

export type ClassDecorator =
  globalThis.ClassDecorator &
  ((target: Function, context: ClassDecoratorContext) => void);

export type MethodDecorator =
  globalThis.MethodDecorator &
  ((target: Function, context: ClassMethodDecoratorContext) => void);

export type AnyConstructor<T> = abstract new (...args: any[]) => T;
export type Constructor<T> = abstract new () => T;
export type NoArgsMethodKeyof<T> = {
  [P in keyof T]-?: T[P] extends (...args: never[]) => any ? P : never;
}[keyof T];
```

### Injectable type

```ts
export type Injectable<T> =
  | AnyConstructor<T>
  | Constructor<T>
  | Token<T>
  | Computed<T>;
```

## 3. Component decorator

```ts
interface ComponentOptions {
  name?: Qualifier;
  scope?: ProviderScope;
  condition?: () => Awaitable<boolean>;
}

declare function Component(options?: ComponentOptions): ClassDecorator;
```

## 4. Lifecycle decorators

```ts
declare function OnConstruct(): MethodDecorator;
declare function OnDestroy(): MethodDecorator;
```

Lifecycle order:

1. **Construction** — constructor runs, default params call `inject()`.
2. **`@OnConstruct()`** — async post-construction initializer. Container waits for completion.
3. **`@OnDestroy()`** — fires during `container.destroy()` or `scope.destroy()`, in **reverse dependency order**.

## 5. Providers

### 5.1 Token

```ts
declare class Token<T> {
  readonly factory: () => Awaitable<T>;
}

declare function token<T>(
  factory: () => Awaitable<T>,
  options?: ProvideOptions<T>,
): Token<T>;
```

### 5.2 Computed

```ts
declare class Computed<T> {
  readonly resolve: () => Awaitable<T>;
}

declare function computed<T>(resolve: () => Awaitable<T>): Computed<T>;
```

### 5.3 `@Provide` — class decorator

Registers a provider for a class or token. Declarative equivalent of `container.provide()`. Multiple `@Provide` decorators can be stacked. Providers are registered when the class is used (via `@Use` or `container.use()`).

```ts
interface ProvideOptions<T> extends ComponentOptions {
  onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

declare function Provide<T>(
  target: Injectable<T>,
  factory: () => Awaitable<T>,
  options?: ProvideOptions<T>,
): ClassDecorator;
```

### 5.4 `@Decorate` — class decorator

Wraps an existing provider. Declarative equivalent of `container.decorate()`. The decorator receives the previously resolved value and returns the new value.

```ts
declare function Decorate<T>(
  target: Injectable<T>,
  decorator: (previous: T) => Awaitable<T>,
): ClassDecorator;
```

## 6. Injection APIs

### 6.1 `inject()`

```ts
declare function inject<T>(injectable: Injectable<T>): T;
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T;
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined;
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined;
```

**Inject points** — `inject()` may only be called in default parameters at:

1. `@Component` class constructors
2. `token()` factory functions
3. `computed()` resolve functions
4. `@Provide` / `@Decorate` factory parameters
5. `ComponentOptions.condition` functions

### 6.2 `injectRef()` — circular references

```ts
declare class Ref<T> {
  get(): T;
}

declare function injectRef<T>(injectable: Injectable<T>): Ref<T>;
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined;
```

Since `injectRef` is called in default parameters, evaluation is already deferred — no wrapper function needed. The injectable is resolved after the requesting component's construction. Calling `ref.get()` during construction throws.

### 6.3 Collection injection

```ts
declare function injectAll<T>(injectable: Injectable<T>, order?: CollectionOrder): readonly T[];
declare function injectSet<T>(injectable: Injectable<T>): ReadonlySet<T>;
declare function injectMap<T>(injectable: Injectable<T>): ReadonlyMap<Qualifier, T>;
```

Returns all `@Component`-decorated subclasses/implementations that are registered in the container. Only explicitly touched components are included.

## 7. Metadata system

General-purpose metadata storage for classes and methods. Foundation for all decorator metadata in Kavri.

```ts
declare interface Metadata<T> {
  readonly name?: string;

  // Decorator factory
  (value: T): ClassDecorator & MethodDecorator;

  // Class-level
  set(target: object, value: T): void;
  of(target: object): T | undefined;
  has(target: object): boolean;

  // Method-level
  set(target: object, method: string | symbol, value: T): void;
  of(target: object, method: string | symbol): T | undefined;
  has(target: object, method: string | symbol): boolean;
  methods(target: object): ReadonlyMap<string | symbol, T>;
}

declare function defineMetadata<T>(name?: string): Metadata<T>;

// Built-in (set by @Component)
declare const componentName: Metadata<Qualifier>;
declare const componentScope: Metadata<ProviderScope>;
```

## 8. Container & scope

```ts
declare class Container {
  provide<T>(target: Injectable<T>, factory: () => Awaitable<T>, options?: ProvideOptions<T>): void;
  decorate<T>(target: Injectable<T>, decorator: (previous: T) => Awaitable<T>): void;

  touch(...injectables: Injectable<any>[]): void;
  use(...injectables: Injectable<any>[]): void;

  resolve<T>(injectable: Injectable<T>): Promise<T>;
  createScope(name?: string): Scope;
  destroy(): Promise<void>;
}

declare class Scope {
  resolve<T>(injectable: Injectable<T>): Promise<T>;
  destroy(): Promise<void>;
}
```

- `provide()` — register or replace a provider. Clears any decorators for this target.
- `decorate()` — wrap an existing provider. Multiple decorators applied in order.
- `touch()` — register injectables without instantiating. Needed for collection injection.
- `use()` — instantiate injectables, process their `@Provide`/`@Decorate` decorators.
- `resolve()` — resolve an injectable. Triggers async init chain.
- `createScope()` — child scope. Scoped providers get fresh instances; singletons shared.

### Scope semantics

| Scope | Container | Child Scope |
|---|---|---|
| `singleton` | Shared instance | Same instance as parent |
| `scoped` | Error if resolved from root | Fresh instance per scope |
| `transient` | New per injection | New per injection |

## 9. Async resolution — Suspense style

All `inject()` calls are synchronous. Async providers are handled via throw-and-retry:

1. When `inject()` encounters an unresolved async provider, it throws a `Promise`.
2. The container catches the Promise, awaits it, then re-invokes the factory.
3. On retry, previously resolved dependencies return cached values.
4. Repeats until the factory completes without throwing.

**Assumption:** all `inject()` calls happen before any side effects. Default parameters satisfy this naturally.

## 10. Full example

```ts
import {
  Container,
  Component,
  Provide,
  Decorate,
  OnConstruct,
  OnDestroy,
  Touch,
  Use,
  token,
  computed,
  inject,
  injectAll,
  injectMap,
  defineMetadata,
  componentName,
} from 'kavri';
import { createConfigSchema, ConfigOptions, injectConfig } from 'kavri/config';
import { z } from 'zod';

// --- config ---

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  url: z.string(),
}));

const AppConfig = createConfigSchema('app', z.object({
  name: z.string().default('demo'),
}));

// --- providers ---

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

@Component({ name: 'mysql' })
class MysqlDriver extends Driver {
  async query(sql: string) { return `mysql:${sql}`; }
}

const SelectedDriver = computed<Driver>(
  (cfg = injectConfig(DbConfig), d = inject(Driver, cfg.driver)) => d,
);

// --- external class via @Provide ---

declare class Redis {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
}

@Component()
@Provide(Redis, async () => {
  const r = new Redis();
  await r.connect('redis://localhost');
  return r;
}, { onDestroy: 'disconnect' })
class RedisModule {}

// --- config customization via @Decorate ---

@Component()
@Decorate(ConfigOptions, (prev) => ({
  ...prev,
  configFiles: ['app.yaml'],
}))
class ConfigModule {}

// --- components ---

@Component()
class UserService {
  constructor(
    private readonly driver = inject(SelectedDriver),
    private readonly redis = inject(Redis),
  ) {}

  @OnConstruct()
  async init() { /* warm cache */ }

  async createUser(name: string) {
    await this.driver.query(`insert into users ...`);
  }
}

// --- custom metadata ---

const Audited = defineMetadata<boolean>('audited');

@Component()
@Audited(true)
class AuditedService {
  doWork() {
    console.log(`audited: ${Audited.of(this)}`); // true
  }
}

// --- bootstrap ---

@Touch(PsqlDriver)
@Use(RedisModule, ConfigModule)
class App {
  constructor(
    private readonly config = injectConfig(AppConfig),
    private readonly users = inject(UserService),
    private readonly drivers = injectMap(Driver),
  ) {}

  @OnDestroy()
  async shutdown() { console.log('shutting down'); }
}

const container = new Container();
const app = await container.resolve(App);
await app.users.createUser('alice');
await container.destroy();
```

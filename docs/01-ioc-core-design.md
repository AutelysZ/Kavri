# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API: explicit provider registration, injection via constructor default parameters, lifecycle hooks, scoped containers, and deterministic async resolution.

For the metadata system that underpins all decorators, see [05-metadata-design.md](./05-metadata-design.md).

## 2. Core types

```ts
export type Qualifier = string | symbol;
export type ProviderScope = 'singleton' | 'scoped' | 'transient';
export type Awaitable<T> = T | Promise<T>;
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

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

interface ComponentMetadata extends ComponentOptions {}

declare function Component(options?: ComponentOptions): ClassDecorator<ComponentMetadata>;
```

All decorators return typed `ClassDecorator<T>` or `MethodDecorator<T>` carrying their metadata. See [05-metadata-design.md](./05-metadata-design.md) for the full metadata system.

## 4. Lifecycle decorators

```ts
declare function OnConstruct(): MethodDecorator<{}>;
declare function OnDestroy(): MethodDecorator<{}>;
```

Lifecycle order:

1. **Construction** — constructor runs, default params call `inject()`.
2. **`@OnConstruct()`** — async post-construction initializer.
3. **`@OnDestroy()`** — fires during destroy, in reverse dependency order.

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

Registers a provider. Declarative equivalent of `container.provide()`.

```ts
interface ProvideOptions<T> extends ComponentOptions {
  onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

interface ProvideMetadata<T> extends ProvideOptions<T> {
  injectable: Injectable<T>;
  factory: () => Awaitable<T>;
}

declare function Provide<T>(
  target: Injectable<T>,
  factory: () => Awaitable<T>,
  options?: ProvideOptions<T>,
): ClassDecorator<ProvideMetadata<T>>;
```

### 5.4 `@Decorate` — class decorator

Wraps an existing provider. Declarative equivalent of `container.decorate()`.

```ts
interface DecorateMetadata<T> {
  target: Injectable<T>;
  decorator: (previous: T) => Awaitable<T>;
}

declare function Decorate<T>(
  target: Injectable<T>,
  decorator: (previous: T) => Awaitable<T>,
): ClassDecorator<DecorateMetadata<T>>;
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
declare class Ref<T> { get(): T; }

declare function injectRef<T>(injectable: Injectable<T>): Ref<T>;
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined;
```

### 6.3 Collection injection

```ts
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, order?: CollectionOrder): readonly T[];
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, as: 'set'): ReadonlySet<T>;
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, as: 'map'): ReadonlyMap<Qualifier, T>;
```

`injectAll` accepts either a base class/token or a `ClassDecoratorFactory` to collect all classes decorated with that decorator. The `'set'` and `'map'` overloads replace the previous `injectSet`/`injectMap` functions.

## 7. Container & scope

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

### Scope semantics

| Scope | Container | Child Scope |
|---|---|---|
| `singleton` | Shared instance | Same instance as parent |
| `scoped` | Error if resolved from root | Fresh instance per scope |
| `transient` | New per injection | New per injection |

## 8. Async resolution — Suspense style

All `inject()` calls are synchronous. Async providers are handled via throw-and-retry:

1. `inject()` encounters an unresolved async provider → throws a `Promise`.
2. Container catches, awaits, re-invokes the factory.
3. Previously resolved dependencies return cached values on retry.
4. Repeats until the factory completes without throwing.

**Assumption:** all `inject()` calls happen before any side effects. Default parameters satisfy this naturally.

## 9. Full example

```ts
import {
  Container, Component, Provide, Decorate, Touch, Use,
  OnConstruct, OnDestroy,
  token, computed, inject, injectAll, injectRef,
  Metadata,
} from 'kavri';
import { createConfigSchema, ConfigOptions } from 'kavri/config';
import { z } from 'zod';

const DbConfig = createConfigSchema('database', z.object({
  driver: z.string(),
  url: z.string(),
}));

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = computed<Driver>(
  (cfg = inject(DbConfig), d = inject(Driver, cfg.driver)) => d,
);

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
@Decorate(ConfigOptions, (prev) => ({ ...prev, configFiles: ['app.yaml'] }))
class AppModule {}

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

@Touch(PsqlDriver)
@Use(AppModule)
class App {
  constructor(private readonly users = inject(UserService)) {}

  @OnDestroy()
  async shutdown() { console.log('bye'); }
}

const container = new Container();
const app = await container.resolve(App);
await app.users.createUser('alice');
await container.destroy();
```

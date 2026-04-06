# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API: explicit provider registration, injection via constructor default parameters, lifecycle hooks, and deterministic async resolution. All components are singletons.

For the metadata system that underpins all decorators, see [05-metadata-design.md](./05-metadata-design.md).

## 2. Core types

```ts
export type Qualifier = string | symbol;
export type Awaitable<T> = T | Promise<T>;
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

export type AnyConstructor<T> = abstract new (...args: any[]) => T;
export type NoArgsMethodKeyof<T> = T extends object
  ? { [P in keyof T]-?: T[P] extends () => any ? P : never; }[keyof T]
  : never;
```

### Injectable type

```ts
export type Injectable<T> =
  | AnyConstructor<T>
  | Token<T>;
```

## 3. Component decorator

```ts
interface ComponentMetadata {
  name?: Qualifier;
}

/** Marks a class as a container-managed component. All components are singletons. */
declare function Component(name?: Qualifier): ClassDecorator<ComponentMetadata>;
```

`@Component()` registers a class with the container. `@Component('name')` registers with a qualifier name.

All decorators return typed `ClassDecorator<T>` or `MethodDecorator<T>` carrying their metadata. See [05-metadata-design.md](./05-metadata-design.md) for the full metadata system.

## 3.1. Conditional decorator

```ts
interface ConditionalMetadata {
  predicate: () => Awaitable<boolean>;
}

/**
 * Marks a component as conditionally enabled.
 * Predicate is evaluated lazily on first inject(). Result is cached.
 * Runs in an inject context — default params can use inject()/injectConfig().
 *
 * CONSTRAINT: @Conditional and @OverrideConfiguration CANNOT coexist on the same class.
 * Enforced at runtime (throws) and by @kavri/eslint-plugin.
 * Reason: configuration must resolve before conditions are evaluated.
 */
declare function Conditional(predicate: () => Awaitable<boolean>): ClassDecorator<ConditionalMetadata>;
```

`@Conditional` is a separate decorator from `@Component`. Components with `@OverrideConfiguration` must NOT have `@Conditional`. Resolver subclasses must NOT have `@Conditional`.

## 4. Lifecycle decorators

```ts
declare function OnConstruct(): MethodDecorator<{}>;
declare function OnDestroy(): MethodDecorator<{}>;
```

Both `@OnConstruct` and `@OnDestroy` are **inject points** -- their method parameters can use `inject()` in default values. Return value is ignored. Multiple on one class: called in declaration order, serially.

Lifecycle order:

1. **Construction** -- constructor runs, default params call `inject()`.
2. **`@OnConstruct()`** -- async post-construction initializer (inject point).
3. **`@OnDestroy()`** -- fires during destroy, in reverse dependency order (inject point).

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

### 5.2 `@Provide` -- class decorator

Registers a provider for a class or token. Multiple `@Provide` can be stacked. Providers are registered when `@Use`-d.

Duplicate providers for the same target throw `DuplicateProviderError` (unless exactly one has `{ primary: true }`). `@Component` counts as an implicit provider -- `@Provide` on the same target requires `{ primary: true }`.

The factory and `onConstruct`/`onDestroy` callbacks are **inject points** -- their parameters can use `inject()` in default values. Return value of callbacks is ignored.

```ts
interface ProvideOptions<T> {
  name?: Qualifier;
  /** Inject point. Return value ignored. */
  onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  /** Inject point. Return value ignored. */
  onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  /** If true, takes precedence when multiple providers exist for the same target. */
  primary?: boolean;
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

## 6. Injection APIs

### 6.1 `inject()`

```ts
declare function inject<T>(injectable: Injectable<T>): T;
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T;
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined;
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined;
```

**Inject points** -- `inject()` / `injectConfig()` may only be called in default parameters at:

1. `@Component` class constructors
2. `token()` factory functions
3. `@Provide` factory parameters
4. `@Conditional` predicate parameters
5. `@OnConstruct` / `@OnDestroy` method parameters
6. `onConstruct` / `onDestroy` callback parameters (`ProvideOptions`)
7. `injectConfig()` -- also an inject point for `@Configuration` classes

### 6.2 `injectRef()` — circular references

```ts
declare class Ref<T> { get(): T; }

declare function injectRef<T>(injectable: Injectable<T>): Ref<T>;
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined;
```

### 6.3 Collection injection

```ts
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, order?: CollectionOrder): readonly T[];
declare function injectSet<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlySet<T>;
declare function injectMap<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlyMap<Qualifier, T>;
```

`injectAll` returns an ordered array. `injectSet` returns a `ReadonlySet`. `injectMap` returns a `ReadonlyMap` keyed by the component's `Qualifier` name. All three accept either a base class/token or a `ClassDecoratorFactory` to collect all classes decorated with that decorator.

## 7. Container

All configuration is done via decorators (`@Provide`, `@Touch`, `@Use`). The container only resolves and destroys. All components are singletons.

```ts
declare class Container {
  resolve<T>(injectable: Injectable<T>): Promise<T>;
  destroy(): Promise<void>;
}
```

### Resolution order

When `container.resolve(target)` is called, all `@Use` deps and the target itself are treated as entrypoints, instantiated serially. For each target:

1. **Check `@Conditional`.** Disabled -> skip. (Configuration resolves before conditions.)
2. **Register decorator metadata:** `@Touch`, `@Provide` (pure registration). Duplicate `@Provide` -> `DuplicateProviderError` (unless primary).
3. **Process `@Use`:** recursively instantiate deps (depth-first).
4. **Call factory** (inject context active).
5. **Call `@OnConstruct` methods** (declaration order, serially, inject point).
6. **Mark instantiated.**

## 8. Error types

```ts
/** Thrown when a circular dependency is detected during resolution. */
declare class CircularDependencyError extends Error {
  readonly chain: Injectable<any>[];
}

/** Thrown when inject() is called for a target with no registered provider (non-optional). */
declare class MissingProviderError extends Error {
  readonly injectable: Injectable<any>;
}

/** Thrown when inject() is called outside a valid inject point. */
declare class InjectContextError extends Error {}

/** Thrown when the container is used after destroy(). */
declare class DestroyedContainerError extends Error {}

/** Thrown when a config schema fails validation during resolution. */
declare class ConfigValidationError extends Error {
  readonly prefix: string;
  readonly issues: unknown;
}

/** Thrown when multiple providers exist for the same target without a primary. */
declare class DuplicateProviderError extends Error {
  readonly injectable: Injectable<any>;
}
```

## 9. Async resolution — Suspense style

All `inject()` calls are synchronous. Async providers are handled via throw-and-retry:

1. `inject()` encounters an unresolved async provider → throws a `Promise`.
2. Container catches, awaits, re-invokes the factory.
3. Previously resolved dependencies return cached values on retry.
4. Repeats until the factory completes without throwing.

**Assumption:** all `inject()` calls happen before any side effects. Default parameters satisfy this naturally.

## 10. Full example

```ts
import {
  Container, Component, Conditional, Provide, Touch, Use,
  OnConstruct, OnDestroy,
  token, inject, injectAll, injectRef,
  Metadata,
} from '@kavri/core';
import { Configuration, injectConfig, OverrideConfiguration, ConfigFileOptions } from '@kavri/config';
import { IsString, IsBoolean } from '@kavri/schema';

@Configuration('database')
class DatabaseConfig {
  @IsString() driver!: string;
  @IsString() url!: string;
}

@Configuration('telemetry')
class TelemetryConfig {
  @IsBoolean({ default: false }) enabled!: boolean;
}

abstract class Driver {
  abstract query(sql: string): Promise<any>;
}

@Component('psql')
class PsqlDriver extends Driver {
  async query(sql: string) { return `psql:${sql}`; }
}

const SelectedDriver = token<Driver>(
  (cfg = injectConfig(DatabaseConfig), d = inject(Driver, cfg.driver)) => d,
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
@OverrideConfiguration(ConfigFileOptions, () => ({ configFile: './config/app' }))
class AppModule {}

@Component()
@Conditional((config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false)
class TelemetryService {
  constructor(private readonly config = injectConfig(TelemetryConfig)) {}
  send(metric: string, value: number): void {}
}

@Component()
class UserService {
  constructor(
    private readonly driver = inject(SelectedDriver),
    private readonly redis = inject(Redis),
    private readonly telemetry = inject(TelemetryService, true),
  ) {}

  @OnConstruct()
  async init(logger = inject(Logger)) { /* warm cache */ }

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

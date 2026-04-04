# IoC Core Design

## 1. Scope

This document defines the implementation-ready IoC core API: explicit provider registration, injection via constructor default parameters, lifecycle hooks, event pub/sub, scoped containers, and deterministic async resolution.

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
  [P in keyof T]-?: T[P] extends () => any ? P : never;
}[keyof T];
```

### Injectable type

The universal type accepted by all injection and container APIs:

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

- `name` — qualifier for named resolution via `inject(Base, name)`.
- `scope` — defaults to `'singleton'`.
- `condition` — evaluated during container init. Runs in an inject context (can use `inject()`/`injectConfig()` in default params). If false, the component is excluded.

## 4. Lifecycle decorators

```ts
declare function OnConstruct(): MethodDecorator;
declare function OnApplicationReady(): MethodDecorator;
declare function OnDestroy(): MethodDecorator;
```

Lifecycle order:

1. **Construction** — constructor runs, default params call `inject()`.
2. **`@OnConstruct()`** — async post-construction initializer. Container waits for completion.
3. **`@OnApplicationReady()`** — fires after the entire dependency graph of a `resolve()` call is wired. All components are available.
4. **`@OnDestroy()`** — fires during `container.destroy()` or `scope.destroy()`, in **reverse dependency order**.

## 5. Providers

### 5.1 Token

A typed named value with a factory default. Used for non-class injectables (primitives, interfaces, external classes).

```ts
declare class Token<T> {
  readonly factory: () => Awaitable<T>;
}

declare function token<T>(
  factory: () => Awaitable<T>,
  options?: ProvideOptions<T>,
): Token<T>;
```

The factory runs in an inject context.

### 5.2 Computed

A dynamic provider that resolves based on runtime conditions. Primary mechanism for config-driven selection.

```ts
declare class Computed<T> {
  readonly resolve: () => Awaitable<T>;
}

declare function computed<T>(
  resolve: () => Awaitable<T>,
): Computed<T>;
```

### 5.3 Method provider (`@Provide`)

For external classes whose constructors you don't control.

```ts
interface ProvideOptions<T> extends ComponentOptions {
  onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  onApplicationReady?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
  onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

declare function Provide<T>(
  clazz: AnyConstructor<T>,
  options?: ProvideOptions<T>,
): MethodDecorator;
```

A class containing `@Provide` methods is called a *module class*. It doesn't need a special decorator — any class can contain `@Provide` methods.

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
4. `@Provide` method parameters
5. `ComponentOptions.condition` functions

Calling `inject()` outside these points throws a runtime error.

### 6.2 `injectRef()` — circular references

```ts
declare class Ref<T> {
  get(): T;
}

declare function injectRef<T>(func: () => Injectable<T>): Ref<T>;
declare function injectRef<T>(func: () => Injectable<T>, optional: true): Ref<T> | undefined;
```

The callback is deferred — the injectable is resolved after the requesting component's construction. Calling `ref.get()` during construction throws.

### 6.3 Collection injection

```ts
declare function injectAll<T>(injectable: Injectable<T>, order?: CollectionOrder): readonly T[];
declare function injectSet<T>(injectable: Injectable<T>): ReadonlySet<T>;
declare function injectMap<T>(injectable: Injectable<T>): ReadonlyMap<Qualifier, T>;
```

Returns all `@Component`-decorated subclasses/implementations of the target that are registered in the container. Only explicitly imported components are included.

- `injectAll` defaults to `'provided'` order.
- `injectMap` keys by `ComponentOptions.name`. Components without a name are excluded from the map.

### 6.4 Notes

- No chained methods or options objects on `inject`.
- Optional injection uses `true` literal as a flag, not a separate function.
- Named injection uses `Qualifier` (string or symbol), not a separate function.
- Collections are implicit — derived from class hierarchy + `@Component` registration. No explicit `collection()` or `registry()` needed.

## 7. Reflection

```ts
declare function getComponentMetadata<T>(
  target: Injectable<T> | T,
): ProvideOptions<T>;
```

Returns the metadata attached by `@Component` or `@Provide`. Useful for reading the component name at runtime.

## 8. Event system

Two event definition styles: class-based (named) and token-based (typed).

```ts
// class-based
declare function EventData(name: string): ClassDecorator;

// token-based
declare class Event<T> {
  readonly data: T;
}
declare function event<T>(): Event<T>;

// listener
declare function EventListener<T>(
  data: AnyConstructor<T> | Event<T>,
): MethodDecorator;

// dispatcher (built-in component, inject via inject(EventDispatcher))
declare class EventDispatcher {
  dispatch<T>(data: T): Promise<void>;
  dispatch<T>(event: Event<T>, data: T): Promise<void>;
}
```

- Class-based events: define a class with `@EventData(name)`, dispatch instances.
- Token-based events: define with `event<T>()`, dispatch with `dispatch(token, data)`.
- Listeners are called in dependency order.
- `dispatch()` is async and waits for all listeners.

## 9. Container & scope

```ts
declare class Container {
  provide<T>(
    target: Injectable<T>,
    factory: () => Awaitable<T>,
    options?: ProvideOptions<T>,
  ): void;

  import(...injectables: Injectable<any>[]): void;
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

- `provide()` — override or register a provider. Factory runs in inject context.
- `import()` — ensure injectables are registered. Needed for collection injection.
- `use()` — ensure injectables are instantiated and `@Provide` methods processed before `resolve()`.
- `resolve()` — resolve an injectable. Triggers async init chain.
- `createScope()` — create a child scope. Scoped providers get fresh instances; singletons are shared.
- `destroy()` — teardown. Calls `@OnDestroy` in reverse dependency order.

### Scope semantics

| Scope | Container | Child Scope |
|---|---|---|
| `singleton` | Shared instance | Same instance as parent |
| `scoped` | Error if resolved from root | Fresh instance per scope |
| `transient` | New per injection | New per injection |

## 10. Async resolution — Suspense style

All `inject()` calls are synchronous. Async providers (token with async factory, `@OnConstruct` async method) are handled via a Suspense-style mechanism:

1. When `inject()` encounters an unresolved async provider, it throws a `Promise`.
2. The container catches the Promise, awaits it, then re-invokes the factory from the top.
3. On retry, previously resolved dependencies return cached values.
4. This repeats until the factory completes without throwing.

**Assumption:** all `inject()` calls happen before any side effects in the factory. Default parameters satisfy this naturally.

## 11. Full example

```ts
import {
  Container,
  Component,
  Provide,
  OnConstruct,
  OnApplicationReady,
  OnDestroy,
  EventData,
  EventListener,
  EventDispatcher,
  event,
  token,
  computed,
  inject,
  injectRef,
  injectAll,
  injectMap,
  getComponentMetadata,
} from 'kavri';
import { Configuration, createConfigSchema, injectConfig } from 'kavri/config';
import { z } from 'zod';

// --- config ---

@Configuration("database")
class DbConfig {
  driver!: string;
  host!: string;
  port!: number;
}

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

class RedisModule {
  @Provide(Redis, { onDestroy: 'disconnect' })
  async createRedis(): Promise<Redis> {
    const r = new Redis();
    await r.connect('redis://localhost');
    return r;
  }
}

// --- events ---

@EventData('user.created')
class UserCreatedEvent {
  constructor(public readonly userId: string) {}
}

const CacheCleared = event<{ scope: string }>();

// --- components ---

@Component()
class UserService {
  constructor(
    private readonly driver = inject(SelectedDriver),
    private readonly events = inject(EventDispatcher),
    private readonly redis = inject(Redis),
  ) {}

  @OnConstruct()
  async init() { /* warm cache */ }

  async createUser(name: string) {
    await this.driver.query(`insert into users ...`);
    await this.events.dispatch(new UserCreatedEvent('u1'));
    await this.events.dispatch(CacheCleared, { scope: 'users' });
  }
}

@Component()
class AuditLogger {
  @EventListener(UserCreatedEvent)
  async onUserCreated(ev: UserCreatedEvent) {
    console.log(`audit: user ${ev.userId} created`);
  }

  @EventListener(CacheCleared)
  onCacheCleared(data: { scope: string }) {
    console.log(`audit: cache cleared for ${data.scope}`);
  }
}

// --- bootstrap ---

@Import(PsqlDriver)
@Use(RedisModule, AuditLogger)
class App {
  constructor(
    private readonly config = injectConfig(AppConfig),
    private readonly users = inject(UserService),
    private readonly drivers = injectMap(Driver),
  ) {}

  @OnApplicationReady()
  async ready() {
    console.log(`${this.config.name} ready, drivers: ${[...this.drivers.keys()]}`);
  }

  @OnDestroy()
  async shutdown() {
    console.log('shutting down');
  }
}

const container = new Container();
container.provide(ConfigOptions, (cfg = inject(ConfigOptions)) => ({
  ...cfg,
  configFiles: ['app.yaml'],
}));

const app = await container.resolve(App);
await app.users.createUser('alice');
await container.destroy();
```

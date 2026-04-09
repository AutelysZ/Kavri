# Metadata System Design

## 1. Purpose

All decorators in Kavri are built on a unified metadata system. Every decorator — `@Component`, `@Provide`, `@OnEvent`, user-defined decorators — is a function that returns a typed `ClassDecorator<T>` or `MethodDecorator<T>`, where `T` is the metadata it carries. This replaces reflect-metadata with an explicit, type-safe mechanism.

## 2. Core types

```ts
// Decorators carry typed metadata via a static metadata field
type DecoratorStatic<T> = { readonly metadata: T | undefined };

type ClassDecorator<T> =
  globalThis.ClassDecorator
  & ((target: Function, context: ClassDecoratorContext) => void)
  & DecoratorStatic<T>;

type MethodDecorator<T> =
  globalThis.MethodDecorator
  & ((target: Function, context: ClassMethodDecoratorContext) => void)
  & DecoratorStatic<T>;

type FieldDecorator<T> =
  globalThis.MethodDecorator
  & ((value: any, context: ClassFieldDecoratorContext) => void)
  & DecoratorStatic<T>;

type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;
type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;
type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>;
```

Every decorator is both a decorator and a metadata carrier. The factory function that creates it serves as the metadata key.

## 3. Reading metadata -- `Metadata.of()` and `Metadata.entries()`

```ts
declare const Metadata: {
  // Class-level: get all metadata of a decorator type on a class
  of<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>): readonly T[];
  of<T>(factory: ClassDecoratorFactory<T>, instance: object): readonly T[];

  // Method-level: by class + method name
  of<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier): readonly T[];
  of<T>(factory: MethodDecoratorFactory<T>, instance: object, key: Qualifier): readonly T[];

  // Programmatic write (push, not replace)
  apply<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>, metadata: T): void;
  apply<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier, metadata: T): void;

  // Get all registered [injectable, metadata] pairs for a class decorator
  entries<T>(factory: ClassDecoratorFactory<T>): readonly [Injectable<any>, T][];

  // Get all registered [injectable, key, metadata] triples for a method decorator
  entries<T>(factory: MethodDecoratorFactory<T>): readonly [Injectable<any>, Qualifier, T][];

  // Lookup metadata on a class and its entire prototype chain (walks up inheritance)
  lookup<T>(factory: ClassDecoratorFactory<T>, clazz: AnyConstructor<any>): readonly T[];
  lookup<T>(factory: MethodDecoratorFactory<T>, clazz: AnyConstructor<any>, key: Qualifier): readonly T[];
  lookup<T>(factory: FieldDecoratorFactory<T>, clazz: AnyConstructor<any>, key: Qualifier): readonly T[];
};
```

`Metadata.of()` returns metadata on the exact target only. Returns `readonly T[]` because a decorator can be applied multiple times.

`Metadata.lookup()` walks the prototype chain — returns metadata from the class and all its ancestors, merged. Useful when a base class has decorators that subclasses should inherit.

`Metadata.entries()` returns all registered pairs/triples for a decorator factory. This is how subsystems discover all classes decorated with a given decorator without a central registry.

### Examples

```ts
// Read @Component metadata
Metadata.of(Component, UserService);     // [{ options: { name: undefined } }]
Metadata.of(Component, myInstance);       // same, works on instances

// Read @Provide metadata from a module
Metadata.of(Provide, InfraModule);       // [{ injectable: Sequelize, ... }, { injectable: Redis, ... }]

// Read @OnEvent metadata from a method
Metadata.of(OnEvent, OrderListener, 'onCreated'); // [{ event: OrderCreatedEvent }]

// Read component name
Metadata.of(Component, myPet)[0]?.options.name;  // 'dog'

// Discover all controllers (class decorator entries)
Metadata.entries(Controller);
// → [[UserController, { path: '/users' }], [AdminController, { path: '/admin' }], ...]

// Discover all rate-limited methods (method decorator entries)
Metadata.entries(RateLimit);
// → [[ApiService, 'search', { maxRequests: 100, windowMs: 60000 }], ...]
```

## 4. Creating decorators

### Class decorators — `createClassDecorator()`

```ts
declare function createClassDecorator<T>(
  factory: ClassDecoratorFactory<T>,
  metadata: T,
  extra?: ClassDecorator<any>[],
): ClassDecorator<T>;
```

The `extra` parameter composes additional decorators. This is how composite decorators work — e.g., a `@Scheduled` that also applies `@Component`.

```ts
// Example: @Scheduled is a @Component that also stores a cron expression
interface ScheduledMetadata {
  cron: string;
}

function Scheduled(cron: string): ClassDecorator<ScheduledMetadata> {
  return createClassDecorator(Scheduled, { cron }, [Component()]);
}

// Usage
@Scheduled('0 * * * *')
class HourlyCleanup { ... }

// Read
Metadata.of(Scheduled, HourlyCleanup);  // [{ cron: '0 * * * *' }]
Metadata.of(Component, HourlyCleanup);  // [{ ... }]  ← also a Component
```

### Method decorators — `createMethodDecorator()`

```ts
declare function createMethodDecorator<T>(
  factory: MethodDecoratorFactory<T>,
  metadata: T,
  extra?: MethodDecorator<any>[],
): MethodDecorator<T>;
```

Same pattern for method-level metadata.

### Field decorators — `createFieldDecorator()`

```ts
declare function createFieldDecorator<T>(
  factory: FieldDecoratorFactory<T>,
  metadata: T,
  extra?: FieldDecorator<any>[],
): FieldDecorator<T>;
```

Used by `@kavri/schema` for schema field decorators (`@IsString`, `@IsInteger`, etc.). See [09-schema-design.md](./09-schema-design.md).

## 5. Built-in decorators as metadata

All built-in decorators carry typed metadata and can be read via `Metadata.of()`:

| Decorator | Metadata type | Example read |
|---|---|---|
| `Component(opts?)` | `ComponentMetadata` | `Metadata.of(Component, cls)` |
| `Provide(target, fn, opts?)` | `ProvideMetadata<T>` | `Metadata.of(Provide, cls)` |
| `Touch(...injectables)` | `readonly Injectable<any>[]` | `Metadata.of(Touch, cls)` |
| `Use(...injectables)` | `readonly Injectable<any>[]` | `Metadata.of(Use, cls)` |
| `EventType(name?)` | `{ name: string \| undefined }` | `Metadata.of(EventType, cls)` |
| `OnEvent(event)` | `{ event: ... }` | `Metadata.of(OnEvent, cls, 'method')` |
| `OnConstruct()` | `{}` | `Metadata.of(OnConstruct, cls, 'init')` |
| `OnDestroy()` | `{}` | `Metadata.of(OnDestroy, cls, 'dispose')` |
| `Configuration(prefix, schema)` | `ConfigurationMetadata<T>` | `Metadata.of(Configuration, token)` |
| `OverrideConfiguration(token, fn)` | `OverrideConfigurationMetadata<T>` | `Metadata.of(OverrideConfiguration, cls)` |

## 6. Programmatic metadata — `Metadata.apply()`

Attach metadata to a class or method without using decorator syntax. `apply()` uses push semantics — it appends to the metadata array rather than replacing it. Useful for dynamic registration or testing.

```ts
// Programmatically mark a class as a Component
Metadata.apply(Component, MyClass, { options: { name: 'dynamic' } });

// Programmatically add an OnEvent handler
Metadata.apply(OnEvent, MyClass, 'handleOrder', { event: OrderCreatedEvent });
```

## 7. Collection injection via decorator

`injectAll()` accepts a `ClassDecoratorFactory` to collect all classes decorated with a specific decorator:

```ts
// Inject all @Scheduled-decorated classes
const jobs = injectAll(Scheduled, 'alphabet');

// Inject all @Component classes (all components)
const components = injectAll(Component);
```

This is how subsystems discover decorated classes without a central registry.

## 8. AsyncContext (`@kavri/basic`)

Async-scoped key-value store backed by `AsyncLocalStorage`. Used by `@kavri/web` for request state, `@kavri/logging` for log context, `@kavri/web` transactions for the transaction stack.

### Key

Each Key has a unique `symbol` internally. State is stored as `Record<symbol, any>`.

```ts
declare class Key<T> {
    readonly name?: string;

    /** Check if value is set in current scope. */
    has(): boolean;

    /** Get value from current scope. Returns undefined if not set or not in scope. */
    get(): T | undefined;

    /** Get value or throw if not set. */
    getOrThrow(): T;

    /** Get value, or insert one computed by fn if not present. */
    getOrInsertComputed(fn: () => T): T;

    /** Set value in current scope. */
    set(value: T): void;

    /**
     * Delete value from current scope.
     * Uses a sentinel so prototype lookup doesn't find parent scope's value.
     */
    delete(): void;
}
```

### AsyncContext

```ts
declare const AsyncContext: {
    /** Create a typed key. Each key has a unique symbol. */
    key<T>(name?: string): Key<T>;

    /** Check if currently inside a scope. */
    isActive(): boolean;

    /**
     * Enter a root scope. If already in a scope, does nothing.
     * Uses AsyncLocalStorage.enterWith(Object.create(null)).
     */
    enter(): void;

    /**
     * Run fn inside a scope.
     * If already active, runs fn directly in the current scope.
     * If not active, creates a new root scope and runs fn.
     */
    run<T>(fn: () => Awaitable<T>): Promise<T>;

    /**
     * Fork a child scope and run fn inside it.
     * Always creates a new scope that inherits from the current via
     * Object.create(currentState). Modifications in the child don't
     * leak to the parent. Parent values are visible in the child
     * unless overwritten or deleted.
     */
    fork<T>(fn: () => Awaitable<T>): Promise<T>;
};
```

### Internals

```ts
// State is a prototype-chained record keyed by symbols.
// Each Key<T> has a unique symbol assigned at creation.
type State = Record<symbol, any>;

const DELETED = Symbol('deleted');
const als = new AsyncLocalStorage<State>();

// Key implementation:
class KeyImpl<T> {
    private readonly sym = Symbol(name);

    has(): boolean {
        const state = als.getStore();
        if (!state) return false;
        const val = state[this.sym];
        return val !== undefined && val !== DELETED;
    }

    get(): T | undefined {
        const state = als.getStore();
        if (!state) return undefined;
        const val = state[this.sym];
        return val === DELETED ? undefined : val;
    }

    set(value: T) {
        const state = als.getStore();
        if (!state) throw new Error('Not in AsyncContext scope');
        state[this.sym] = value;
    }

    delete() {
        const state = als.getStore();
        if (!state) throw new Error('Not in AsyncContext scope');
        state[this.sym] = DELETED;  // sentinel — blocks prototype lookup
    }

    getOrInsertComputed(fn: () => T): T {
        let val = this.get();
        if (val === undefined) {
            val = fn();
            this.set(val);
        }
        return val;
    }
}

// AsyncContext implementation:
enter() {
    if (als.getStore()) return;  // already in scope
    als.enterWith(Object.create(null));
}

run<T>(fn) {
    if (als.getStore()) return fn();  // reuse current scope
    return als.run(Object.create(null), fn);
}

fork<T>(fn) {
    const current = als.getStore() ?? Object.create(null);
    return als.run(Object.create(current), fn);  // prototype-chained child
}
```

### Usage

```ts
const kRequestId = AsyncContext.key<string>('requestId');
const kUser = AsyncContext.key<User>('user');

// Web framework per-request:
await AsyncContext.run(async () => {
    kRequestId.set(crypto.randomUUID());
    // ... handle request
});

// Fork a child scope (e.g., per-subrequest):
await AsyncContext.fork(async () => {
    kUser.set(overrideUser);  // only visible in this fork
    // parent's kRequestId still visible via prototype chain
});

// Delete a key in child scope:
await AsyncContext.fork(async () => {
    kUser.delete();           // blocks parent's value
    kUser.get();              // undefined
});
```

## 9. Full example

```ts
import {
  Component,
  Metadata,
  createClassDecorator,
  createMethodDecorator,
  inject,
  injectAll,
} from '@kavri/container';

// ---- Custom class decorator ----

interface CacheableOptions {
  ttl: number;
  key?: string;
}

function Cacheable(options: CacheableOptions): ClassDecorator<CacheableOptions> {
  return createClassDecorator(Cacheable, options);
}

@Component()
@Cacheable({ ttl: 3600 })
class UserService {
  getUser(id: string) { return { id }; }
}

Metadata.of(Cacheable, UserService); // [{ ttl: 3600 }]

// ---- Custom method decorator ----

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

function RateLimit(options: RateLimitOptions): MethodDecorator<RateLimitOptions> {
  return createMethodDecorator(RateLimit, options);
}

@Component()
class ApiService {
  @RateLimit({ maxRequests: 100, windowMs: 60000 })
  search(query: string) { return []; }
}

Metadata.of(RateLimit, ApiService, 'search'); // [{ maxRequests: 100, windowMs: 60000 }]

// ---- Composite decorator ----

interface ScheduledOptions {
  cron: string;
}

function Scheduled(cron: string): ClassDecorator<ScheduledOptions> {
  return createClassDecorator(Scheduled, { cron }, [Component()]);
}

@Scheduled('0 * * * *')
class HourlyJob {
  @OnConstruct()
  async run() { /* ... */ }
}

Metadata.of(Scheduled, HourlyJob);  // [{ cron: '0 * * * *' }]
Metadata.of(Component, HourlyJob);  // [{ ... }] ← also a Component

// Discover all scheduled jobs
const jobs = injectAll(Scheduled);
```

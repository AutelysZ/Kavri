# Metadata System Design

## 1. Purpose

All decorators in Kavri are built on a unified metadata system. Every decorator — `@Component`, `@Provide`, `@OnEvent`, user-defined decorators — is a function that returns a typed `ClassDecorator<T>` or `MethodDecorator<T>`, where `T` is the metadata it carries. This replaces reflect-metadata with an explicit, type-safe mechanism.

## 2. Core types

```ts
// Decorators carry typed metadata via a static __metadata__ field
type DecoratorStatic<T> = { readonly __metadata__: T | undefined };

type ClassDecorator<T> =
  globalThis.ClassDecorator
  & ((target: Function, context: ClassDecoratorContext) => void)
  & DecoratorStatic<T>;

type MethodDecorator<T> =
  globalThis.MethodDecorator
  & ((target: Function, context: ClassMethodDecoratorContext) => void)
  & DecoratorStatic<T>;

type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;
type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;
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
};
```

`Metadata.of()` returns `readonly T[]` because a decorator can be applied multiple times (e.g., multiple `@Provide` on one class).

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

The `extra` parameter composes additional decorators. This is how composite decorators work — e.g., a `@Controller` that also applies `@Component`.

```ts
// Example: @Controller is a @Component that also stores a path
interface ControllerMetadata {
  path: string;
}

function Controller(path: string, options?: ComponentOptions): ClassDecorator<ControllerMetadata> {
  return createClassDecorator(Controller, { path }, [Component(options)]);
}

// Usage
@Controller('/users')
class UserController { ... }

// Read
Metadata.of(Controller, UserController);  // [{ path: '/users' }]
Metadata.of(Component, UserController);   // [{ ... }]  ← also a Component
```

### Method decorators — `createMethodDecorator()`

```ts
declare function createMethodDecorator<T>(
  factory: MethodDecoratorFactory<T>,
  metadata: T,
  extra?: ClassDecorator<any>[],
): MethodDecorator<T>;
```

Same pattern for method-level metadata.

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
// Inject all @Controller-decorated classes
const controllers = injectAll(Controller, 'alphabetical');

// Inject all @Component classes (all components)
const components = injectAll(Component);
```

This is how the HTTP layer discovers controllers without a central registry.

## 8. Full example

```ts
import {
  Component,
  Metadata,
  createClassDecorator,
  createMethodDecorator,
  inject,
  injectAll,
} from '@kavri/core';

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

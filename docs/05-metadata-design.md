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

## 3. Reading metadata — `Metadata.of()`

```ts
declare const Metadata: {
  // Class-level: get all metadata of a decorator type on a class
  of<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>): readonly T[];
  of<T>(factory: ClassDecoratorFactory<T>, instance: object): readonly T[];

  // Method-level: by class + method name, or by method reference
  of<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier): readonly T[];
  of<T>(factory: MethodDecoratorFactory<T>, instance: object, key: Qualifier): readonly T[];
  of<T>(factory: MethodDecoratorFactory<T>, method: Function): readonly T[];

  // Programmatic write
  decorate<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>, metadata: T): void;
  decorate<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier, metadata: T): void;
};
```

Returns `readonly T[]` because a decorator can be applied multiple times (e.g., multiple `@Provide` on one class).

### Examples

```ts
// Read @Component metadata
Metadata.of(Component, UserService);     // [{ name: undefined, scope: 'singleton' }]
Metadata.of(Component, myInstance);       // same, works on instances

// Read @Provide metadata from a module
Metadata.of(Provide, InfraModule);       // [{ injectable: Sequelize, ... }, { injectable: Redis, ... }]

// Read @OnEvent metadata from a method
Metadata.of(OnEvent, OrderListener, 'onCreated'); // [{ event: OrderCreatedEvent }]

// Read component name
Metadata.of(Component, myPet)[0]?.name;  // 'dog'
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
| `Decorate(target, fn)` | `DecorateMetadata<T>` | `Metadata.of(Decorate, cls)` |
| `Touch(...injectables)` | `readonly Injectable<any>[]` | `Metadata.of(Touch, cls)` |
| `Use(...injectables)` | `readonly Injectable<any>[]` | `Metadata.of(Use, cls)` |
| `Event(name?)` | `{ name: string \| undefined }` | `Metadata.of(Event, cls)` |
| `OnEvent(event)` | `{ event: ... }` | `Metadata.of(OnEvent, cls, 'method')` |
| `OnConstruct()` | `{}` | `Metadata.of(OnConstruct, cls, 'init')` |
| `OnDestroy()` | `{}` | `Metadata.of(OnDestroy, cls, 'dispose')` |
| `Configuration(prefix, schema)` | `ConfigurationMetadata<T>` | `Metadata.of(Configuration, token)` |

## 6. Programmatic metadata — `Metadata.decorate()`

Attach metadata to a class or method without using decorator syntax. Useful for dynamic registration or testing.

```ts
// Programmatically mark a class as a Component
Metadata.decorate(Component, MyClass, { name: 'dynamic', scope: 'singleton' });

// Programmatically add an OnEvent handler
Metadata.decorate(OnEvent, MyClass, 'handleOrder', { event: OrderCreatedEvent });
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
} from 'kavri';

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

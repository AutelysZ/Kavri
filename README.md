# Kavri

> **Design Draft vNext** — an IoC/DI framework for TypeScript that uses explicit `inject(...)` semantics instead of `reflect-metadata`.

Kavri is designed for teams who want **predictable dependency injection**, **strong typing**, and **runtime portability** (Node.js, Bun, Deno, edge runtimes) without relying on decorator metadata reflection.

---

## Table of Contents

- [1. Vision](#1-vision)
- [2. Design Principles](#2-design-principles)
- [3. Core Concepts](#3-core-concepts)
- [4. Proposed API Surface](#4-proposed-api-surface)
- [5. Provider Model](#5-provider-model)
- [6. Lifetime & Scope Model](#6-lifetime--scope-model)
- [7. Module System](#7-module-system)
- [8. Configuration System](#8-configuration-system)
- [9. Lifecycle Hooks](#9-lifecycle-hooks)
- [10. Advanced Features](#10-advanced-features)
- [11. Diagnostics & Developer Experience](#11-diagnostics--developer-experience)
- [12. Error Model](#12-error-model)
- [13. Testing Strategy](#13-testing-strategy)
- [14. Compatibility & Runtime Targets](#14-compatibility--runtime-targets)
- [15. Security Considerations](#15-security-considerations)
- [16. Example: End-to-End Composition](#16-example-end-to-end-composition)
- [17. Roadmap](#17-roadmap)
- [18. Non-Goals](#18-non-goals)

---

## 1. Vision

Kavri should be:

1. **Metadata-free by default**: injection is explicit through `inject(...)`, never implicit by emitted type metadata.
2. **Type-first**: rich generic typing for tokens, factories, modules, and configuration.
3. **Deterministic**: container behavior is predictable, auditable, and debuggable.
4. **Composable**: feature modules can be loaded eagerly or lazily and remain testable.
5. **Production-ready**: clear lifecycle, shutdown behavior, diagnostics, and observability hooks.

---

## 2. Design Principles

### 2.1 Explicitness over magic
Dependencies must be visible in constructor/property defaults via `inject(...)`, `inject.optional(...)`, `inject.all(...)`, etc.

### 2.2 Declarative composition
Providers and modules are declared as data structures where possible, reducing hidden runtime behavior.

### 2.3 Fast startup, minimal overhead
Avoid reflection scans and expensive runtime metadata lookups.

### 2.4 Framework-agnostic core
Kavri core should have no hard dependency on HTTP servers, ORMs, or UI frameworks.

### 2.5 Strong failure semantics
Failures should include resolution path, token name, and scope context.

---

## 3. Core Concepts

### 3.1 Token
A typed identifier for dependencies:

- class constructor token (`UserService`)
- symbol token (`token<UserRepo>('UserRepo')`)
- opaque branded token for primitive/value configs

```ts
const UserRepoToken = token<UserRepo>('UserRepo');
```

### 3.2 Provider
A mapping from token to resolver strategy (`value`, `class`, `factory`, `alias`).

### 3.3 Container
Runtime engine that resolves dependencies and manages lifecycles/scopes.

### 3.4 Module
A composable unit that declares imports, providers, exports, and optional startup hooks.

### 3.5 Scope
Resolution boundary controlling lifetime and cache behavior.

---

## 4. Proposed API Surface

> The following is a **design proposal**, not an implementation contract.

```ts
// tokens
function token<T>(description?: string): Token<T>;

// injection helpers
const inject: {
  <T>(token: TokenLike<T>): T;
  optional<T>(token: TokenLike<T>): T | undefined;
  all<T>(token: TokenLike<T>): T[];
  lazy<T>(token: TokenLike<T>): () => Promise<T>;
  provider<T>(token: TokenLike<T>): ProviderRef<T>;
};

// component and metadata-friendly decorators
function Component(options?: ComponentOptions): ClassDecorator;
function Named(base: TokenLike<any>, name: string): ClassDecorator;

// lifecycle decorators
function PostConstruct(): MethodDecorator;
function BeforeDestroy(): MethodDecorator;

// module declaration
function defineModule(spec: ModuleSpec): ModuleRef;

// container
class Container {
  register(...providersOrModules: Registration[]): this;
  createScope(name?: string): ScopedContainer;
  get<T>(token: TokenLike<T>): Promise<T>;
  getSync?<T>(token: TokenLike<T>): T; // only when graph is sync-safe
  getAll<T>(token: TokenLike<T>): Promise<T[]>;
  has(token: TokenLike<any>): boolean;
  override(token: TokenLike<any>, provider: Provider<any>): this;
  snapshot(): ContainerSnapshot;
  restore(snapshot: ContainerSnapshot): this;
  destroy(): Promise<void>;
}
```

---

## 5. Provider Model

Support four core provider kinds:

```ts
type Provider<T> =
  | { provide: TokenLike<T>; useValue: T }
  | { provide: TokenLike<T>; useClass: Constructor<T>; scope?: ScopeKind }
  | { provide: TokenLike<T>; useFactory: Factory<T>; deps?: DepList; scope?: ScopeKind }
  | { provide: TokenLike<T>; useExisting: TokenLike<T> };
```

### 5.1 Multi providers
Allow many providers bound to one token.

```ts
{ provide: HookToken, useClass: MetricsHook, multi: true }
{ provide: HookToken, useClass: AuditHook, multi: true }
```

Resolved via `inject.all(HookToken)`.

### 5.2 Conditional providers
Enable environment-dependent registration without runtime branching in business logic.

```ts
when(env.isProd, { provide: LoggerToken, useClass: JsonLogger })
```

### 5.3 Async providers
`useFactory` may return `Promise<T>`. Container must await once and cache by scope.

---

## 6. Lifetime & Scope Model

### 6.1 Scope kinds

- **singleton**: one instance per root container
- **scoped**: one instance per child scope (request/job)
- **transient**: new instance every resolution

### 6.2 Scope usage pattern

```ts
const requestScope = root.createScope('http-request');
const handler = await requestScope.get(RequestHandler);
await requestScope.destroy();
```

### 6.3 Rules

- Singleton can depend on singleton only (strict mode), or scoped/transient with explicit opt-in escape hatch.
- Scoped can depend on singleton/scoped/transient.
- Transient can depend on anything.

Provide a strict validator to detect unsafe singleton->scoped edges.

---

## 7. Module System

### 7.1 Module declaration

```ts
export const UserModule = defineModule({
  name: 'user',
  imports: [ConfigModule, DbModule],
  providers: [UserService, UserController],
  exports: [UserService],
});
```

### 7.2 Module visibility

- Providers are private by default.
- Only `exports` are visible to importers.
- Re-exporting supported for façade modules.

### 7.3 Dynamic modules

A module factory can receive inputs and emit module spec.

```ts
UserModule.forRoot({ cache: true })
UserModule.forFeature({ region: 'us-east-1' })
```

### 7.4 Lazy modules

- Declarative lazy module refs (`defineLazyModule`)
- Predicate-based activation using config/env
- Async import with warm-up hooks

---

## 8. Configuration System

Configuration should be first-class, typed, and validated.

### 8.1 API proposal

```ts
const AppConfig = config.schema('app', {
  port: config.number().default(3000),
  env: config.enum(['dev', 'test', 'prod']).default('dev'),
  featureX: config.boolean().default(false),
});

const cfg = inject(AppConfig);
const port = config.value(AppConfig, 'port');
```

### 8.2 Sources

Merge strategy (priority high to low):

1. explicit runtime override
2. process/env provider
3. `.env`/file source
4. schema defaults

### 8.3 Validation

- Startup fails fast on invalid config.
- Error message includes source and key path.

---

## 9. Lifecycle Hooks

### 9.1 Component hooks

- `@PostConstruct` called after dependency graph is satisfied.
- `@BeforeDestroy` called on controlled shutdown.

### 9.2 Provider-level lifecycle

Support lifecycle handlers for `useFactory` and external resources:

```ts
{
  provide: DbToken,
  useFactory: async () => new DatabaseClient(),
  onInit: (db) => db.connect(),
  onDestroy: (db) => db.close(),
}
```

### 9.3 Ordering guarantees

- Init: topological dependency order
- Destroy: reverse topological order
- Errors: aggregated and annotated

---

## 10. Advanced Features

### 10.1 Interceptors / middleware for providers
Cross-cutting hooks around resolution:

- tracing
- metrics
- caching policies
- policy enforcement

### 10.2 Circular dependency handling

- detect cycle and throw with full path
- optional `inject.lazy(...)` to break legal cycles deliberately

### 10.3 Aliasing and namespacing

```ts
alias(UserRepoToken, SqlUserRepoToken)
namespace('billing').token<Gateway>('Gateway')
```

### 10.4 Plugin API

Plugins can register providers/modules and diagnostics extensions:

```ts
container.use(pluginMetrics())
container.use(pluginOpenTelemetry())
```

### 10.5 Runtime graph inspection

```ts
const graph = container.inspect();
graph.toDOT();
graph.findUnreachable();
```

---

## 11. Diagnostics & Developer Experience

### 11.1 Human-readable errors
Errors should include:

- unresolved token
- request chain (`A -> B -> C`)
- active module/scope
- suggested fixes

### 11.2 Startup validation mode

```ts
await container.validate({ strictScopes: true, detectCycles: true });
```

### 11.3 Debug utilities

- resolution trace logs
- duplicate provider warnings
- deprecated API warnings

---

## 12. Error Model

Typed error classes:

- `ResolutionError`
- `CircularDependencyError`
- `ProviderConflictError`
- `ScopeViolationError`
- `LifecycleError`
- `ConfigValidationError`

Each should include structured metadata for tooling and tests.

---

## 13. Testing Strategy

### 13.1 Test container helpers

- `createTestContainer()` with sane defaults
- deterministic overrides and mocks
- automatic cleanup

### 13.2 Override ergonomics

```ts
const test = createTestContainer(AppModule)
  .override(UserRepoToken, { useValue: fakeRepo })
  .override(LoggerToken, { useClass: SilentLogger });
```

### 13.3 Snapshot and restore
Useful for integration tests that need fast reset.

---

## 14. Compatibility & Runtime Targets

- TypeScript 5+
- Node.js LTS, Bun, Deno, edge workers
- ESM-first, with CJS compatibility plan
- Works with both legacy and TC39 decorators (opt-in adapters)

---

## 15. Security Considerations

- No arbitrary code evaluation in config parsing
- Optional provider allowlist for hardened environments
- Explicit module imports reduce accidental provider exposure
- Avoid implicit global singletons in test/runtime cross-talk

---

## 16. Example: End-to-End Composition

```ts
const UserRepoToken = token<UserRepo>('UserRepo');

@Component({ scope: 'scoped' })
class UserService {
  constructor(
    private readonly repo = inject(UserRepoToken),
    private readonly hooks = inject.all(UserHookToken),
  ) {}
}

const UserModule = defineModule({
  name: 'user',
  providers: [
    UserService,
    { provide: UserRepoToken, useClass: SqlUserRepo, scope: 'singleton' },
    { provide: UserHookToken, useClass: MetricsUserHook, multi: true },
  ],
  exports: [UserService],
});

const AppModule = defineModule({
  name: 'app',
  imports: [ConfigModule, UserModule],
});

const container = new Container().register(AppModule);
await container.validate({ strictScopes: true, detectCycles: true });

const scope = container.createScope('request');
const userService = await scope.get(UserService);
await scope.destroy();
await container.destroy();
```

---

## 17. Roadmap

### Phase 1 — Core correctness

- token/provider/container core
- lifecycle and scopes
- strict graph validation

### Phase 2 — Module maturity

- dynamic/lazy modules
- export visibility guarantees
- plugin registration API

### Phase 3 — Tooling & ecosystem

- graph inspector and DOT export
- test utilities package
- framework adapters (HTTP, CLI, workers)

### Phase 4 — Stability

- semantic versioning and migration guides
- benchmark suite and performance budgets
- long-term support policy

---

## 18. Non-Goals

- Replacing application frameworks (Kavri is infrastructure, not MVC).
- Magical auto-registration by scanning the filesystem.
- Hiding dependency edges through implicit reflection.

---

## Status

This README describes the **target design direction**. APIs and names are intentionally flexible during design iteration.

# 02. IoC Container API

## Core concepts

- **Token**: typed dependency key.
- **Provider**: rule to create or map a value for a token.
- **Container**: resolver and lifecycle manager.
- **Scope**: lifetime boundary.

## Tokens

```ts
const UserRepoToken = token<UserRepo>('user.repo');
const DbPoolToken = token<DbPool>('db.pool');
```

### Registry token (for dynamic providers)

```ts
const DatabaseDriverRegistry = registryToken<Driver>('database.driver');
```

A registry token stores named implementations and supports safe runtime selection.

## Providers

```ts
type Provider<T> =
  | { provide: TokenLike<T>; useValue: T }
  | { provide: TokenLike<T>; useClass: Constructor<T>; scope?: ScopeKind }
  | { provide: TokenLike<T>; useFactory: Factory<T>; deps?: Dep[]; scope?: ScopeKind }
  | { provide: TokenLike<T>; useExisting: TokenLike<T> };
```

## Entry-point ergonomics

Kavri intentionally supports both **simple** and **advanced** styles.

### Simple style (no explicit module required)

```ts
@Component()
class Foo {
  ping() {
    return 'ok';
  }
}

const container = new Container();

// Resolve + run lifecycle hooks
const foo1 = await container.resolve(Foo);

// Just instantiate synchronously when graph is sync-safe; no lifecycle hooks
const foo2 = container.get(Foo);
```

### Advanced style

```ts
const AppModule = defineModule({
  imports: [UserModule],
  providers: [FooService],
});

const container = new Container().use(AppModule);
const foo = await container.resolve(FooService);
```

## Container API proposal

```ts
class Container {
  // registration
  provide(...providers: Provider<any>[]): this;
  use(module: ModuleRef): this;

  // resolution
  get<T>(token: TokenLike<T>): T; // no lifecycle
  resolve<T>(token: TokenLike<T>): Promise<T>; // with lifecycle
  resolveAll<T>(token: TokenLike<T>): Promise<T[]>;

  // runtime control
  has(token: TokenLike<unknown>): boolean;
  createScope(name?: string): ScopedContainer;
  override<T>(token: TokenLike<T>, provider: Provider<T>): this;

  // diagnostics
  validate(options?: ValidationOptions): Promise<void>;
  inspect(): DependencyGraph;

  // shutdown
  destroy(): Promise<void>;
}
```

## `inject(...)` helpers

```ts
const inject: {
  <T>(token: TokenLike<T>): T;
  optional<T>(token: TokenLike<T>): T | undefined;
  all<T>(token: TokenLike<T>): T[];
  lazy<T>(token: TokenLike<T>): () => Promise<T>;
  named<T>(token: TokenLike<T>, name: string): T;
};
```

## Lifecycle semantics

- `resolve(...)` will trigger component/provider `onInit` or `@PostConstruct`.
- `get(...)` intentionally skips lifecycle (for fast, local, controlled use).
- `destroy()` calls `onDestroy` / `@BeforeDestroy` in reverse order.

## Scope rules

- `singleton`: root cached.
- `scoped`: per-scope cached.
- `transient`: never cached.

Strict mode should reject unsafe singleton -> scoped dependency chains.

## Error model

- `ResolutionError`
- `CircularDependencyError`
- `ScopeViolationError`
- `ProviderConflictError`
- `LifecycleError`

All errors should include dependency path metadata.

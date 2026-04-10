import { AsyncLocalStorage } from 'node:async_hooks';
import type { Awaitable } from './types.js';

/**
 * A typed key for storing values in a {@link Context}.
 *
 * Keys are used directly as Map keys — no symbols needed.
 * Create via the static factory `Key.of<T>(name)`.
 *
 * @example
 * ```ts
 * const REQUEST = Key.of<IncomingMessage>('request');
 * ctx.set(REQUEST, req);
 * ```
 */
export class Key<T> {
  /** Optional name for debugging/error messages. */
  readonly name: string | undefined;

  /** Phantom field for type-level tracking. Never set at runtime. */
  declare readonly __type: T | undefined;

  private constructor(name?: string) {
    this.name = name;
  }

  /** Create a typed key. */
  static of<T>(name?: string): Key<T> {
    return new Key<T>(name);
  }
}

/**
 * A key-value store backed by `Map<Key, unknown>` with parent chain support.
 *
 * Contexts are created by {@link AsyncScope.create} (detached) or received
 * as callback parameters in {@link AsyncScope.run} / {@link AsyncScope.fork}.
 *
 * State methods (`has`, `get`, `set`, `delete`) operate on the local Map.
 * `has` and `get` walk up the parent chain. `set` and `delete` only affect
 * the current context's own Map — parent values remain untouched.
 *
 * Scope methods (`isActive`, `run`, `fork`, `enter`) delegate to the owning
 * {@link AsyncScope}, passing this context as the state parameter.
 */
export interface Context {
  /** Check if a key has a value (own or inherited from parent). */
  has(key: Key<unknown>): boolean;

  /** Get value. Checks own Map first, then parent chain. */
  get<V>(key: Key<V>): V | undefined;

  /** Get value or throw if absent in the entire chain. */
  getOrThrow<V>(key: Key<V>): V;

  /** Get value if present, otherwise set and return the provided value. */
  getOrInsert<V>(key: Key<V>, value: V): V;

  /** Get value if present, otherwise compute, set, and return. */
  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V;

  /** Set a value in this context's own Map. Returns `this` for chaining. */
  set<V>(key: Key<V>, value: V): this;

  /** Delete a key from this context's own Map only. Parent values become visible again. */
  delete(key: Key<unknown>): boolean;

  /** Whether the owning AsyncScope currently has an active ALS scope. */
  isActive(): boolean;

  /**
   * Enter ALS scope with this context and run `fn`.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  run<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T>;

  /**
   * Create a child context and run `fn` in an ALS scope with it.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  fork<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T>;

  /**
   * Enter ALS scope imperatively with this context.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  enter(): void;

  /** Create a child context that inherits from this one. */
  extend(): Context;
}

/**
 * Internal implementation of {@link Context}.
 * Not exported — users receive Context instances from AsyncScope methods.
 */
class ContextImpl implements Context {
  readonly #store = new Map<Key<unknown>, unknown>();
  readonly #parent: ContextImpl | undefined;
  readonly #scope: AsyncScope;

  constructor(scope: AsyncScope, parent?: ContextImpl) {
    this.#scope = scope;
    this.#parent = parent;
  }

  has(key: Key<unknown>): boolean {
    if (this.#store.has(key)) return true;
    return this.#parent?.has(key) ?? false;
  }

  get<V>(key: Key<V>): V | undefined {
    if (this.#store.has(key)) return this.#store.get(key) as V;
    return this.#parent?.get(key);
  }

  getOrThrow<V>(key: Key<V>): V {
    if (!this.has(key)) {
      throw new Error(`Key "${key.name ?? '(unnamed)'}" is not set`);
    }
    return this.get(key) as V;
  }

  getOrInsert<V>(key: Key<V>, value: V): V {
    if (this.has(key)) return this.get(key) as V;
    this.#store.set(key, value);
    return value;
  }

  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V {
    if (this.has(key)) return this.get(key) as V;
    const value = callback(key);
    this.#store.set(key, value);
    return value;
  }

  set<V>(key: Key<V>, value: V): this {
    this.#store.set(key, value);
    return this;
  }

  delete(key: Key<unknown>): boolean {
    return this.#store.delete(key);
  }

  isActive(): boolean {
    return this.#scope.isActive();
  }

  run<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T> {
    return this.#scope.run(fn, this);
  }

  fork<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T> {
    return this.#scope.fork(fn, this);
  }

  enter(): void {
    this.#scope.enter(this);
  }

  extend(): Context {
    return new ContextImpl(this.#scope, this);
  }
}

/**
 * Async-scoped context manager backed by `AsyncLocalStorage`.
 *
 * Each usage scenario creates its own `AsyncScope` instance.
 * The internal `AsyncLocalStorage` is created lazily on first scope entry.
 *
 * State methods (`has`, `get`, `set`, etc.) delegate to the current ALS
 * context and throw if no scope is active.
 *
 * Use `create()` to get a detached {@link Context} without entering ALS —
 * pass it explicitly through your call chain for zero-overhead scoping.
 *
 * @example
 * ```ts
 * const RequestContext = new AsyncScope();
 * const REQUEST = Key.of<IncomingMessage>('request');
 *
 * // Explicit passing (no ALS overhead):
 * const ctx = RequestContext.create();
 * ctx.set(REQUEST, req);
 *
 * // Or implicit via ALS:
 * await RequestContext.run((ctx) => {
 *   ctx.set(REQUEST, req);
 * });
 * ```
 */
export class AsyncScope {
  #als: AsyncLocalStorage<ContextImpl> | undefined;

  #ensureAls(): AsyncLocalStorage<ContextImpl> {
    if (!this.#als) {
      this.#als = new AsyncLocalStorage<ContextImpl>();
    }
    return this.#als;
  }

  /**
   * Get the current ALS context, or throw if not in a scope.
   * Used by delegated state methods.
   */
  #current(): ContextImpl {
    const ctx = this.#als?.getStore();
    if (!ctx) throw new Error('Not in AsyncScope');
    return ctx;
  }

  /**
   * Verify that `state` (if provided) matches the current ALS context.
   * Throws if ALS is active with a different context.
   */
  #checkState(current: ContextImpl | undefined, state: Context | undefined): void {
    if (current && state && state !== current) {
      throw new Error('Provided context does not match active scope');
    }
  }

  // -- Delegated state methods (require active scope) --

  /** @see {@link Context.has} */
  has(key: Key<unknown>): boolean {
    return this.#current().has(key);
  }

  /** @see {@link Context.get} */
  get<V>(key: Key<V>): V | undefined {
    return this.#current().get(key);
  }

  /** @see {@link Context.getOrThrow} */
  getOrThrow<V>(key: Key<V>): V {
    return this.#current().getOrThrow(key);
  }

  /** @see {@link Context.getOrInsert} */
  getOrInsert<V>(key: Key<V>, value: V): V {
    return this.#current().getOrInsert(key, value);
  }

  /** @see {@link Context.getOrInsertComputed} */
  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V {
    return this.#current().getOrInsertComputed(key, callback);
  }

  /** @see {@link Context.set} */
  set<V>(key: Key<V>, value: V): this {
    this.#current().set(key, value);
    return this;
  }

  /** @see {@link Context.delete} */
  delete(key: Key<unknown>): boolean {
    return this.#current().delete(key);
  }

  // -- Scope methods --

  /** Returns `true` if an ALS scope is active. */
  isActive(): boolean {
    return this.#als?.getStore() !== undefined;
  }

  /**
   * Run `fn` in an ALS scope.
   *
   * - If not active: enters ALS with `state` (or a new Context), runs `fn`.
   * - If active: verifies `state` matches current (throws if mismatch), runs `fn` with current.
   *
   * @param fn - Receives the active Context.
   * @param state - Optional Context to use. Must match current if ALS is already active.
   */
  async run<T>(fn: (ctx: Context) => Awaitable<T>, state?: Context): Promise<T> {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    if (current) return fn(current);
    const ctx = (state as ContextImpl | undefined) ?? new ContextImpl(this);
    return als.run(ctx, () => fn(ctx));
  }

  /**
   * Fork a child scope and run `fn` in it.
   *
   * Always creates a child Context. Parent is `state` (if provided),
   * the current ALS context, or a new root Context.
   *
   * @param fn - Receives the forked child Context.
   * @param state - Optional parent Context. Must match current if ALS is already active.
   */
  async fork<T>(fn: (ctx: Context) => Awaitable<T>, state?: Context): Promise<T> {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    const parent = (state as ContextImpl | undefined) ?? current ?? new ContextImpl(this);
    const child = new ContextImpl(this, parent);
    return als.run(child, () => fn(child));
  }

  /**
   * Enter an ALS scope imperatively (no callback).
   *
   * - If not active: enters ALS with `state` (or a new Context).
   * - If active: verifies `state` matches current (throws if mismatch), no-op.
   *
   * @param state - Optional Context to use.
   */
  enter(state?: Context): void {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    if (current) return;
    const ctx = (state as ContextImpl | undefined) ?? new ContextImpl(this);
    als.enterWith(ctx);
  }

  /** Create a detached {@link Context} without entering an ALS scope. */
  create(): Context {
    return new ContextImpl(this);
  }
}

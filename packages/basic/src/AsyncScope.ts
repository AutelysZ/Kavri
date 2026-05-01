import type { Key } from './Key.js';
import type { Awaitable } from './types.js';
import type { Context } from './Context.js';
import { Env, type AsyncLocalStorage } from '@kavri/env';

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
export class AsyncScope<S extends Context = Context> {
  #als: AsyncLocalStorage<S> | undefined;
  constructor(private readonly Context: new (as: AsyncScope<S>, parent?: S) => S) {}

  #ensureAls(): AsyncLocalStorage<S> {
    if (!this.#als) {
      this.#als = new Env.AsyncLocalStorage<S>();
    }
    return this.#als;
  }

  /**
   * Get the current ALS context, or throw if not in a scope.
   * Used by delegated state methods.
   */
  #current(): S {
    const ctx = this.#als?.getStore();
    if (!ctx) throw new Error('Not in AsyncScope');
    return ctx;
  }

  /**
   * Verify that `state` (if provided) matches the current ALS context.
   * Throws if ALS is active with a different context.
   */
  #checkState(current: S | undefined, state: S | undefined): void {
    if (current && state && state !== current) {
      throw new Error('Provided context does not match active scope');
    }
  }

  // -- Delegated state methods (require active scope) --

  /**
   * @see {@link Context.has}
   */
  has(key: Key<unknown>): boolean {
    return this.#current().has(key);
  }

  /**
   * @see {@link Context.get}
   */
  get<V>(key: Key<V>): V | undefined {
    return this.#current().get(key);
  }

  /**
   * @see {@link Context.getOrThrow}
   */
  getOrThrow<V>(key: Key<V>): V {
    return this.#current().getOrThrow(key);
  }

  /**
   * @see {@link Context.getOrInsert}
   */
  getOrInsert<V>(key: Key<V>, value: V): V {
    return this.#current().getOrInsert(key, value);
  }

  /**
   * @see {@link Context.getOrInsertComputed}
   */
  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V {
    return this.#current().getOrInsertComputed(key, callback);
  }

  /**
   * @see {@link Context.set}
   */
  set<V>(key: Key<V>, value: V): this {
    this.#current().set(key, value);
    return this;
  }

  /**
   * @see {@link Context.delete}
   */
  delete(key: Key<unknown>): boolean {
    return this.#current().delete(key);
  }

  // -- Scope methods --

  /**
   * Returns `true` if an ALS scope is active.
   */
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
  async run<T>(fn: (ctx: S) => Awaitable<T>, state?: S): Promise<T> {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    if (current) return fn(current);
    const ctx = (state as S | undefined) ?? new this.Context(this);
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
  async fork<T>(fn: (ctx: S) => Awaitable<T>, state?: S): Promise<T> {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    const parent = state ?? current ?? new this.Context(this);
    const child = new this.Context(this, parent);
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
  enter(state?: S): void {
    const als = this.#ensureAls();
    const current = als.getStore();
    this.#checkState(current, state);
    if (current) return;
    const ctx = state ?? new this.Context(this);
    als.enterWith(ctx);
  }
}

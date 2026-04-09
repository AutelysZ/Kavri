import { AsyncLocalStorage } from 'node:async_hooks';
import type { Awaitable } from './types.js';

type State = Record<symbol, unknown>;
const DELETED: unique symbol = Symbol('DELETED');
const als = new AsyncLocalStorage<State>();

/**
 * A typed key for storing values in an {@link AsyncContext} scope.
 *
 * Each key has a unique internal symbol. Values are stored in a prototype-chained
 * record managed by `AsyncContext`. Keys are type-safe: `Key<string>` only accepts
 * and returns `string` values.
 *
 * @example
 * ```ts
 * const kUser = AsyncContext.key<User>('user');
 * await AsyncContext.run(() => {
 *   kUser.set(currentUser);
 *   console.log(kUser.get()); // User
 * });
 * ```
 */
export class Key<T> {
  /** Optional name for debugging/error messages. */
  readonly name?: string;
  private readonly sym: symbol;

  constructor(name?: string) {
    this.name = name;
    this.sym = Symbol(name);
  }

  /** Returns `true` if a value is set in the current scope (not deleted, not absent). */
  has(): boolean {
    const state = als.getStore();
    if (!state) return false;
    const val = state[this.sym];
    return val !== undefined && val !== DELETED;
  }

  /**
   * Get the value from the current scope.
   * Returns `undefined` if not in a scope, not set, or deleted.
   */
  get(): T | undefined {
    const state = als.getStore();
    if (!state) return undefined;
    const val = state[this.sym];
    return val === DELETED ? undefined : (val as T);
  }

  /**
   * Get the value or throw if not set.
   * @throws Error if not in a scope or the key has no value.
   */
  getOrThrow(): T {
    if (!this.has()) {
      throw new Error(`Key "${this.name ?? '(unnamed)'}" is not set`);
    }
    return this.get() as T;
  }

  /**
   * Get the value, or compute and store it if absent.
   * Uses {@link has} to check presence, so explicitly set `undefined` values
   * won't trigger recomputation if `T` includes `undefined`.
   */
  getOrInsertComputed(fn: () => T): T {
    if (this.has()) return this.get() as T;
    const val = fn();
    this.set(val);
    return val;
  }

  /**
   * Set a value in the current scope.
   * @throws Error if not in an AsyncContext scope.
   */
  set(value: T): void {
    const state = als.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    state[this.sym] = value;
  }

  /**
   * Delete the value from the current scope.
   * Uses a sentinel value so prototype lookup doesn't find a parent scope's value.
   * @throws Error if not in an AsyncContext scope.
   */
  delete(): void {
    const state = als.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    state[this.sym] = DELETED;
  }
}

/**
 * Async-scoped key-value store backed by `AsyncLocalStorage`.
 *
 * Provides `run()` for root scopes and `fork()` for child scopes with
 * prototype-chained isolation. Used by `@kavri/web` for per-request state,
 * `@kavri/logging` for log context, and transactions for the transaction stack.
 *
 * @example
 * ```ts
 * const kId = AsyncContext.key<string>('requestId');
 * await AsyncContext.run(async () => {
 *   kId.set(crypto.randomUUID());
 *   await AsyncContext.fork(async () => {
 *     console.log(kId.get()); // parent's value visible
 *     kId.set('override');    // only in this fork
 *   });
 *   console.log(kId.get());   // unchanged
 * });
 * ```
 */
export const AsyncContext = {
  /** Create a typed key. Each key has a unique internal symbol. */
  key<T>(name?: string): Key<T> {
    return new Key<T>(name);
  },

  /** Returns `true` if currently inside an AsyncContext scope. */
  isActive(): boolean {
    return als.getStore() !== undefined;
  },

  /**
   * Enter a root scope imperatively (no callback).
   * If already in a scope, does nothing.
   * Uses `AsyncLocalStorage.enterWith()`.
   */
  enter(): void {
    if (als.getStore()) return;
    als.enterWith(Object.create(null) as State);
  },

  /**
   * Run `fn` inside a scope. If already in a scope, reuses the current one.
   * If not, creates a new root scope.
   * @returns The return value of `fn`, wrapped in a Promise.
   */
  async run<T>(fn: () => Awaitable<T>): Promise<T> {
    if (als.getStore()) return fn();
    return als.run(Object.create(null) as State, fn);
  },

  /**
   * Fork a child scope and run `fn` inside it.
   * Always creates a new scope that inherits from the current via `Object.create()`.
   * Modifications in the child don't leak to the parent. Parent values are visible
   * in the child unless overwritten or deleted.
   * @returns The return value of `fn`, wrapped in a Promise.
   */
  async fork<T>(fn: () => Awaitable<T>): Promise<T> {
    const current = als.getStore() ?? (Object.create(null) as State);
    return als.run(Object.create(current) as State, fn);
  },
};

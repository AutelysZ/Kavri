import { AsyncLocalStorage } from 'node:async_hooks';
import type { Awaitable } from './types.js';

type State = Record<symbol, unknown>;

/**
 * A typed key for storing values in an {@link AsyncContext} scope.
 *
 * Keys are thin wrappers around a unique symbol. They carry no methods —
 * all operations go through the `AsyncContext` instance.
 *
 * @example
 * ```ts
 * const kUser = AsyncContext.key<User>('user');
 * await AsyncContext.run(() => {
 *   AsyncContext.set(kUser, currentUser);
 *   console.log(AsyncContext.get(kUser));
 * });
 * ```
 */
export class Key<T> {
  /** The unique symbol used as the property key in scope state. */
  readonly symbol: symbol;

  /** Phantom field for type-level tracking. Never set at runtime. */
  declare readonly __type: T;

  constructor(name?: string) {
    this.symbol = Symbol(name);
  }
}

/**
 * Async-scoped key-value store backed by `AsyncLocalStorage`.
 *
 * State is stored as `Record<symbol, unknown>`, prototype-chained via
 * `Object.create()` for fork isolation. The internal `AsyncLocalStorage`
 * is created lazily on first scope entry to avoid overhead when unused.
 *
 * `has(key)` uses `symbol in state` so `set(key, undefined)` is distinguishable
 * from absence. `delete(key)` only removes the key from the current scope's own
 * properties — parent values remain visible via the prototype chain.
 *
 * Exported as singleton `AsyncContext` from `@kavri/basic`.
 *
 * @example
 * ```ts
 * import { AsyncContext } from '@kavri/basic';
 * const kId = AsyncContext.key<string>('requestId');
 * await AsyncContext.run(async () => {
 *   AsyncContext.set(kId, crypto.randomUUID());
 *   await AsyncContext.fork(async () => {
 *     console.log(AsyncContext.get(kId)); // parent's value visible
 *     AsyncContext.set(kId, 'override');  // only in this fork
 *   });
 *   console.log(AsyncContext.get(kId));   // unchanged
 * });
 * ```
 */
export class AsyncContextStore {
  private als: AsyncLocalStorage<State> | undefined;

  /** Ensure the ALS is initialized. Lazy to avoid overhead when unused. */
  private ensureAls(): AsyncLocalStorage<State> {
    if (!this.als) {
      this.als = new AsyncLocalStorage<State>();
    }
    return this.als;
  }

  /** Create a typed key. Each key has a unique internal symbol. */
  key<T>(name?: string): Key<T> {
    return new Key<T>(name);
  }

  /** Returns `true` if currently inside a scope. */
  isActive(): boolean {
    return this.als?.getStore() !== undefined;
  }

  /**
   * Enter a root scope imperatively (no callback).
   * If already in a scope, does nothing.
   */
  enter(): void {
    const als = this.ensureAls();
    if (als.getStore()) return;
    als.enterWith(Object.create(null) as State);
  }

  /**
   * Run `fn` inside a scope. If already in a scope, reuses the current one.
   * @returns The return value of `fn`, wrapped in a Promise.
   */
  async run<T>(fn: () => Awaitable<T>): Promise<T> {
    const als = this.ensureAls();
    if (als.getStore()) return fn();
    return als.run(Object.create(null) as State, fn);
  }

  /**
   * Fork a child scope and run `fn` inside it.
   * Always creates a new scope that inherits from the current via `Object.create()`.
   * Writes in the child don't leak to the parent.
   */
  async fork<T>(fn: () => Awaitable<T>): Promise<T> {
    const als = this.ensureAls();
    const current = als.getStore() ?? (Object.create(null) as State);
    return als.run(Object.create(current) as State, fn);
  }

  /**
   * Check if a key has a value in the current scope (own or inherited).
   * Uses `symbol in state` so `set(key, undefined)` counts as present.
   * Returns `false` if not in a scope.
   */
  has<T>(key: Key<T>): boolean {
    const state = this.als?.getStore();
    if (!state) return false;
    return key.symbol in state;
  }

  /**
   * Get the value for a key from the current scope.
   * Returns `undefined` if not in a scope or key is absent.
   */
  get<T>(key: Key<T>): T | undefined {
    const state = this.als?.getStore();
    if (!state) return undefined;
    return state[key.symbol] as T | undefined;
  }

  /**
   * Get the value or throw if the key is absent.
   * @throws Error if not in a scope or the key has no value.
   */
  getOrThrow<T>(key: Key<T>): T {
    if (!this.has(key)) {
      throw new Error(`Key "${key.symbol.description ?? '(unnamed)'}" is not set`);
    }
    return this.get(key) as T;
  }

  /**
   * Get the value, or compute and store it if absent.
   * Uses {@link has} to check presence.
   */
  getOrInsertComputed<T>(key: Key<T>, fn: () => T): T {
    if (this.has(key)) return this.get(key) as T;
    const val = fn();
    this.set(key, val);
    return val;
  }

  /**
   * Set a value in the current scope.
   * @throws Error if not in an AsyncContext scope.
   */
  set<T>(key: Key<T>, value: T): void {
    const state = this.als?.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    state[key.symbol] = value;
  }

  /**
   * Delete a key from the current scope's own properties only.
   * Parent scope values remain accessible via the prototype chain.
   * @throws Error if not in an AsyncContext scope.
   */
  delete<T>(key: Key<T>): void {
    const state = this.als?.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    delete state[key.symbol];
  }
}

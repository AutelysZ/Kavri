import type { AsyncScope } from './AsyncScope.js';
import { ChainKeyMap } from './ChainKeyMap.js';
import type { Awaitable } from './types.js';

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
export class Context extends ChainKeyMap {
  readonly #scope: AsyncScope;

  constructor(scope: AsyncScope, parent?: Context) {
    super(parent);
    this.#scope = scope;
  }

  /**
   * Whether the owning AsyncScope currently has an active ALS scope.
   */
  isActive(): boolean {
    return this.#scope.isActive();
  }

  /**
   * Enter ALS scope with this context and run `fn`.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  run<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T> {
    return this.#scope.run(fn, this);
  }

  /**
   * Create a child context and run `fn` in an ALS scope with it.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  fork<T>(fn: (ctx: Context) => Awaitable<T>): Promise<T> {
    return this.#scope.fork(fn, this);
  }

  /**
   * Enter ALS scope imperatively with this context.
   * If ALS is already active, verifies this context is the current one (throws otherwise).
   */
  enter(): void {
    this.#scope.enter(this);
  }
}

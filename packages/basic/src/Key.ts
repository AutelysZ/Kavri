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
  /**
   * Optional name for debugging/error messages.
   */
  readonly name: string | undefined;

  /**
   * Phantom field for type-level tracking. Never set at runtime.
   */
  declare readonly __type: T | undefined;

  private constructor(name?: string) {
    this.name = name;
  }

  toString() {
    return this.name ?? '(unnamed)';
  }

  /**
   * Create a typed key.
   */
  static of<T>(name?: string): Key<T> {
    return new Key<T>(name);
  }
}

import type { Key } from './Key.js';

export class ChainKeyMap {
  #map: Map<Key<unknown>, unknown>;
  #parent: ChainKeyMap | undefined;
  constructor(
    parent: ChainKeyMap | undefined,
    items?: readonly (readonly [Key<unknown>, unknown])[],
  ) {
    this.#parent = parent;
    this.#map = new Map(items);
  }

  delete(key: Key<unknown>): boolean {
    return this.#map.delete(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#map.has(key) ? (this.#map.get(key) as T | undefined) : this.#parent?.get(key);
  }

  getOrInsert<T>(key: Key<T>, defaultValue: T): T {
    if (!this.has(key)) {
      this.#map.set(key, defaultValue);
      return defaultValue;
    }
    return this.get(key) as T;
  }

  getOrInsertComputed<T>(key: Key<T>, callback: (key: Key<T>) => T): T {
    if (!this.has(key)) {
      const defaultValue = callback(key);
      this.#map.set(key, defaultValue);
      return defaultValue;
    }
    return this.get(key) as T;
  }

  getOrThrow<T>(key: Key<T>): T {
    if (!this.has(key)) {
      throw new Error(`"${key}" is not set`);
    }
    return this.get(key) as T;
  }

  has(key: Key<unknown>): boolean {
    return this.#map.has(key) || (this.#parent != null && this.#parent.has(key));
  }

  set<T>(key: Key<T>, value: T): this {
    this.#map.set(key, value);
    return this;
  }
}

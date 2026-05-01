import type { Key } from './Key.js';

export class KeyMap {
  #map: Map<Key<unknown>, unknown>;
  constructor(items?: readonly (readonly [Key<unknown>, unknown])[]) {
    this.#map = new Map(items);
  }
  get<T>(key: Key<T>): T | undefined {
    return this.#map.get(key) as T | undefined;
  }

  has(key: Key<unknown>): boolean {
    return this.#map.has(key);
  }

  getOrThrow<T>(key: Key<T>): T {
    if (!this.has(key)) {
      throw new Error(`Key ${key} not found`);
    }
    return this.get(key) as T;
  }

  getOrInsert<T>(key: Key<T>, defaultValue: T): T {
    if (!this.has(key)) {
      this.set(key, defaultValue);
      return defaultValue;
    }
    return this.get(key) as T;
  }

  getOrInsertComputed<T>(key: Key<T>, callback: (key: Key<T>) => T): T {
    if (!this.has(key)) {
      const defaultValue = callback(key);
      this.set(key, defaultValue);
      return defaultValue;
    }
    return this.get(key) as T;
  }

  set<T>(key: Key<T>, value: T): this {
    this.#map.set(key, value);
    return this;
  }

  delete(key: Key<unknown>): boolean {
    return this.#map.delete(key);
  }
}

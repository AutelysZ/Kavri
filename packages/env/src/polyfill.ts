function define<T, K extends keyof T>(
  clazz: abstract new (...args: never[]) => T,
  key: K,
  value: T[K],
) {
  if (typeof clazz.prototype[key] !== typeof value) {
    Object.defineProperty(clazz.prototype, key, { value, writable: true, configurable: true });
  }
}

function getOrInsertComputed(
  this: Map<never, never> | WeakMap<never, never>,
  key: never,
  callback: (key: never) => never,
) {
  if (this.has(key)) return this.get(key);
  const v = callback(key);
  this.set(key, v);
  return v;
}

function getOrInsert(this: Map<never, never> | WeakMap<never, never>, key: never, value: never) {
  if (this.has(key)) return this.get(key);
  this.set(key, value);
  return value;
}

let initialized = false;

export function polyfill() {
  if (initialized) return;
  define(Map, 'getOrInsertComputed', getOrInsertComputed);
  define(WeakMap, 'getOrInsertComputed', getOrInsertComputed);
  define(Map, 'getOrInsert', getOrInsert);
  define(WeakMap, 'getOrInsert', getOrInsert);
  initialized = true;
}

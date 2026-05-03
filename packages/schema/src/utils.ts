/* eslint-disable @typescript-eslint/no-explicit-any */

import type { JsonSchema } from './jsonschema.js';

export type StringKeyOf<T> = keyof T & string;
export type PartialRecord<K extends PropertyKey, V> = { [P in K]?: V };
export type Nullable<T> = T | undefined | null;
export type EnumLike = { [sk: string]: string | number; [nk: number]: string };

/**
 * Deep equality check for JSON-compatible values.
 * Handles primitives, arrays, plain objects, null, undefined, Date, and NaN.
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // NaN === NaN
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;

  // Null / undefined / primitive mismatch
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  // Date
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date !== b instanceof Date) return false;

  // Array
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;
  if (aIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Plain object
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }
  return true;
}

export function isArray<T extends readonly unknown[]>(v: unknown): v is T {
  return Array.isArray(v);
}

/**
 * Is object and not array
 * @param v
 */
export function isObject<T extends object>(v: unknown): v is Exclude<T, readonly any[]> {
  return typeof v === 'object' && v !== null && !isArray(v);
}

export function isFunction<T extends (...args: any[]) => any>(v: unknown): v is T {
  return typeof v === 'function';
}

export function isString<T extends string>(v: unknown): v is T {
  return typeof v === 'string';
}

/**
 * is finite number
 * @param v
 */
export function isNumber<T extends number>(v: unknown): v is T {
  return Number.isFinite(v);
}

export function isInteger<T extends number>(v: unknown): v is T {
  return Number.isSafeInteger(v);
}

export function isBigInt<T extends bigint>(v: unknown): v is T {
  return typeof v === 'bigint';
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/* #__NO_SIDE_EFFECTS__ */
export function entryOf<T extends object>(v: T): [keyof T & string, T[keyof T]][] {
  return Object.entries(v) as any;
}

/* #__NO_SIDE_EFFECTS__ */
export function keyOf<T extends object>(v: T): (keyof T & string)[] {
  return Object.keys(v) as any;
}

/* #__NO_SIDE_EFFECTS__ */
export function valueOf<T extends object>(v: T): T[keyof T][] {
  return Object.values(v) as any;
}

export function toNonNullableArray<T>(input: Nullable<T> | T[]): T[] {
  return input == null ? [] : Array.isArray(input) ? input : [input];
}

export function uniqueFilter<T>() {
  const seen = new Set<T>();
  return (value: T) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  };
}

export function hasType(s: JsonSchema, t: string): boolean {
  return (isString(s.type) && s.type === t) || (isArray(s.type) && s.type.includes(t));
}

export function addType(types: string | string[], extra?: JsonSchema) {
  return (_: unknown, current: JsonSchema) => {
    const out = toNonNullableArray(current.type).concat(types).filter(uniqueFilter());
    return { type: out.length > 1 ? out : out[0], ...extra };
  };
}

export function addEncoding(encoding: string) {
  return (_: unknown, current: JsonSchema): JsonSchema => {
    return {
      contentEncoding: `${current.contentEncoding ? current.contentEncoding + '+' : ''}${encoding}`,
    };
  };
}

const CONTAINS_PREFIX = 'contains:';

/**
 * Build the marker key used by `Contains` to mark an array index that matched
 * its schema in `DecodeContext.evaluated`. Read by `MinContains`/`MaxContains`
 * (via {@link containsCount}) and by `UnevaluatedItems` (via
 * {@link isEvaluatedIndex}).
 *
 * @param index - The 0-based array index.
 * @returns The namespaced marker key (e.g. `'contains:0'`).
 */
export function containsKey(index: number): string {
  return CONTAINS_PREFIX + index;
}

/**
 * Count the array indexes marked as matched by a sibling `Contains` decorator
 * in the current `DecodeContext.evaluated` set.
 *
 * Used by `MinContains` and `MaxContains` to enforce `contains` cardinality.
 *
 * @param evaluated - The evaluation tracking set from the current decode context.
 * @returns The number of indexes carrying a {@link containsKey} marker.
 */
export function containsCount(evaluated: ReadonlySet<string>): number {
  let count = 0;
  for (const k of evaluated) {
    if (k.startsWith(CONTAINS_PREFIX)) count++;
  }
  return count;
}

/**
 * Whether an array index has been evaluated by any sibling decorator — either
 * a positional/items decorator (plain index string) or `Contains` (prefixed
 * via {@link containsKey}).
 *
 * Used by `UnevaluatedItems` to skip indexes already covered by an
 * `items` / `prefixItems` / `contains` keyword.
 *
 * @param evaluated - The evaluation tracking set from the current decode context.
 * @param index - The 0-based array index.
 * @returns `true` if the index was evaluated, `false` otherwise.
 */
export function isEvaluatedIndex(evaluated: ReadonlySet<string>, index: number): boolean {
  const s = index + '';
  return evaluated.has(s) || evaluated.has(CONTAINS_PREFIX + s);
}

export function hasOwn(obj: unknown, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function enumValues<T extends EnumLike>(host: T): T[keyof T][] {
  const out: T[keyof T][] = [];
  for (const v of valueOf(host)) {
    if (typeof host[v] === 'number') {
      continue;
    }
    out.push(v);
  }
  return out;
}

export function enumKeys<T extends EnumLike>(host: T): (keyof T & string)[] {
  const out: (keyof T & string)[] = [];
  for (const [k, v] of entryOf(host)) {
    if (typeof host[v] === 'number') {
      continue;
    }
    out.push(k);
  }
  return out;
}

export function todo(): never {
  throw new Error('Not implemented');
}

/* #__NO_SIDE_EFFECTS__ */
export function once<T>(fn: () => T) {
  let cache: [T] | undefined = undefined;
  return () => {
    if (cache) {
      return cache[0];
    }
    cache = [fn()];
    return cache[0];
  };
}

export function addAll<T>(out: Set<T>, src: Iterable<T>) {
  for (const v of src) {
    out.add(v);
  }
}

export function typeOf(v: unknown) {
  return typeof v;
}

export type TypeOf = ReturnType<typeof typeOf>;

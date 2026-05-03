import { isBigInt } from './utils.js';

/**
 * Convert the data into plain object.
 *
 * Usage:
 *
 * ```ts
 * JSON.stringify(data, jsonReplacer)
 * ```
 */
export function jsonReplacer(this: unknown, value: unknown, key: unknown) {
  if (isBigInt(value)) return value.toString();
  // todo, read key related decorators to encode the field
  return value;
}

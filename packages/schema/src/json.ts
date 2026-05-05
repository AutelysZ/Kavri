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
  // todo, read key related decorators to encode the field
  return value;
}

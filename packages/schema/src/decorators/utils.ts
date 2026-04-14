/* eslint-disable @typescript-eslint/no-explicit-any */

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

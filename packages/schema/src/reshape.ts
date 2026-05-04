import { type AnyConstructor, Metadata, type UnionToIntersection } from '@kavri/basic';
import { IsOptional } from './decorators/base.js';
import { FieldSchema, type FieldSchemaDecoratorMetadata } from './field.js';

// ---------------------------------------------------------------------------
// Internal: rebuild a class from a target field map
// ---------------------------------------------------------------------------

type FieldsMap = Map<string, readonly FieldSchemaDecoratorMetadata[]>;

/**
 * Snapshot every schema field of `ctor` (walking the prototype chain) into a
 * fresh `Map` so reshape helpers can mutate without touching the source.
 */
function snapshotFields(ctor: AnyConstructor): FieldsMap {
  const out: FieldsMap = new Map();
  const found = Metadata.lookupField(FieldSchema, ctor);
  if (!found) return out;
  for (const [k, v] of found) {
    out.set(String(k), v);
  }
  return out;
}

/**
 * Build a new anonymous class and re-apply each metadata entry to it via the
 * legacy field-decorator invocation, so the new class becomes a self-contained
 * source of truth for its fields (no prototype-chain dependency on `ctor`).
 */
function rebuildClass(fields: FieldsMap): AnyConstructor {
  class Reshaped {}
  for (const [key, entries] of fields) {
    for (const meta of entries) {
      FieldSchema(meta.factory, meta.params, meta.options)(Reshaped.prototype, key);
    }
  }
  return Reshaped as AnyConstructor;
}

/** Append a synthetic `IsOptional` entry to the field's decorator list. */
function withOptional(
  entries: readonly FieldSchemaDecoratorMetadata[],
): FieldSchemaDecoratorMetadata[] {
  if (entries.some((m) => m.factory === IsOptional)) return [...entries];
  return [...entries, IsOptional().metadata];
}

/** Strip any `IsOptional` entries from the field's decorator list. */
function withoutOptional(
  entries: readonly FieldSchemaDecoratorMetadata[],
): FieldSchemaDecoratorMetadata[] {
  return entries.filter((m) => m.factory !== IsOptional);
}

// ---------------------------------------------------------------------------
// Public reshape helpers
// ---------------------------------------------------------------------------

/**
 * Omit specified fields.
 *
 * Using `Omit` for type reshaping is generally not a good idea, as it may
 * inadvertently introduce unintended fields. Whenever possible, try to use
 * more restrictive methods — such as {@link Pick} instead.
 */
export function Omit<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K>> {
  const drop = new Set<string>(keys.map(String));
  const all = snapshotFields(ctor);
  const out: FieldsMap = new Map();
  for (const [k, v] of all) {
    if (!drop.has(k)) out.set(k, v);
  }
  return rebuildClass(out) as AnyConstructor<globalThis.Omit<T, K>>;
}

/**
 * Keep only the listed fields.
 */
export function Pick<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Pick<T, K>> {
  const all = snapshotFields(ctor);
  const out: FieldsMap = new Map();
  for (const k of keys) {
    const entries = all.get(String(k));
    if (entries) out.set(String(k), entries);
  }
  return rebuildClass(out) as AnyConstructor<globalThis.Pick<T, K>>;
}

/**
 * Mark the listed fields as optional. With no keys, every field is made
 * optional.
 */
export function Partial<T>(ctor: AnyConstructor<T>): AnyConstructor<globalThis.Partial<T>>;
export function Partial<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K> & globalThis.Partial<globalThis.Pick<T, K>>>;
export function Partial<T>(
  ctor: AnyConstructor<T>,
  ...keys: (keyof T)[]
): AnyConstructor<globalThis.Partial<T>> {
  const targets = keys.length > 0 ? new Set<string>(keys.map(String)) : null;
  const all = snapshotFields(ctor);
  const out: FieldsMap = new Map();
  for (const [k, v] of all) {
    out.set(k, targets === null || targets.has(k) ? withOptional(v) : v);
  }
  return rebuildClass(out) as AnyConstructor<globalThis.Partial<T>>;
}

/**
 * Pick `pick` as required, `partial` as optional. Equivalent to
 * `Merge([Pick(ctor, ...pick), Partial(Pick(ctor, ...partial))])` but in one
 * call.
 */
export function PickPartial<T, const P extends keyof T, const O extends keyof T>(
  ctor: AnyConstructor<T>,
  pick: readonly P[],
  partial: readonly O[],
): AnyConstructor<globalThis.Pick<T, P> & globalThis.Partial<globalThis.Pick<T, O>>> {
  const all = snapshotFields(ctor);
  const out: FieldsMap = new Map();
  for (const k of pick) {
    const entries = all.get(String(k));
    if (entries) out.set(String(k), entries);
  }
  for (const k of partial) {
    const entries = all.get(String(k));
    if (entries) out.set(String(k), withOptional(entries));
  }
  return rebuildClass(out) as AnyConstructor<
    globalThis.Pick<T, P> & globalThis.Partial<globalThis.Pick<T, O>>
  >;
}

/**
 * Strip the `IsOptional` decorator from the listed fields. With no keys,
 * every field becomes required.
 */
export function Required<T>(ctor: AnyConstructor<T>): AnyConstructor<globalThis.Required<T>>;
export function Required<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K> & globalThis.Required<globalThis.Pick<T, K>>>;
export function Required<T>(
  ctor: AnyConstructor<T>,
  ...keys: (keyof T)[]
): AnyConstructor<globalThis.Required<T>> {
  const targets = keys.length > 0 ? new Set<string>(keys.map(String)) : null;
  const all = snapshotFields(ctor);
  const out: FieldsMap = new Map();
  for (const [k, v] of all) {
    out.set(k, targets === null || targets.has(k) ? withoutOptional(v) : v);
  }
  return rebuildClass(out) as AnyConstructor<globalThis.Required<T>>;
}

/**
 * Merge fields from multiple classes. When a field is present in more than
 * one source, the later one wins (right-most class overrides earlier ones).
 */
export function Merge<const E extends readonly AnyConstructor[] | []>(
  ctors: E,
): AnyConstructor<
  UnionToIntersection<
    {
      [P in keyof E]: E[P] extends AnyConstructor<infer U> ? U : never;
    }[number]
  >
> {
  const out: FieldsMap = new Map();
  for (const ctor of ctors) {
    const all = snapshotFields(ctor as AnyConstructor);
    for (const [k, v] of all) {
      out.set(k, v);
    }
  }
  return rebuildClass(out) as never;
}

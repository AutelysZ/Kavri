import type {
  Qualifier,
  ClassDecorator,
  MethodDecorator,
  FieldDecorator,
  ClassDecoratorFactory,
  MethodDecoratorFactory,
  FieldDecoratorFactory,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal storage
//
// Class-level metadata: WeakMap<factory, Map<constructor, metadata[]>>
// Member-level metadata: WeakMap<factory, Map<constructor, Map<key, metadata[]>>>
//
// WeakMap keyed by factory allows GC if a factory is unreferenced.
// Inner Maps use strong references because Metadata.entries() must iterate.
// ---------------------------------------------------------------------------

const classStore = new WeakMap<Function, Map<Function, unknown[]>>();
const memberStore = new WeakMap<Function, Map<Function, Map<Qualifier, unknown[]>>>();

/** Push a class-level metadata entry. */
function pushClassMeta(factory: Function, target: Function, metadata: unknown): void {
  let byTarget = classStore.get(factory);
  if (!byTarget) {
    byTarget = new Map();
    classStore.set(factory, byTarget);
  }
  let items = byTarget.get(target);
  if (!items) {
    items = [];
    byTarget.set(target, items);
  }
  items.push(metadata);
}

/** Push a member-level (method/field) metadata entry. */
function pushMemberMeta(
  factory: Function,
  target: Function,
  key: Qualifier,
  metadata: unknown,
): void {
  let byTarget = memberStore.get(factory);
  if (!byTarget) {
    byTarget = new Map();
    memberStore.set(factory, byTarget);
  }
  let byKey = byTarget.get(target);
  if (!byKey) {
    byKey = new Map();
    byTarget.set(target, byKey);
  }
  let items = byKey.get(key);
  if (!items) {
    items = [];
    byKey.set(key, items);
  }
  items.push(metadata);
}

// ---------------------------------------------------------------------------
// TC39 pending metadata
//
// TC39 method/field decorators cannot access the class constructor at
// decoration time. Pending entries are stored in `context.metadata` (the
// shared DecoratorMetadata object per class) and flushed when:
// (a) a class decorator runs on the same class, or
// (b) Metadata.of/entries/lookup lazily flushes via Symbol.metadata.
// ---------------------------------------------------------------------------

interface PendingEntry {
  factory: Function;
  key: Qualifier;
  metadata: unknown;
}

const PENDING = Symbol('kavri:pending');
const FLUSHED = Symbol('kavri:flushed');

/** Store a pending member metadata entry in the TC39 DecoratorMetadata object. */
function storePending(
  meta: DecoratorMetadata,
  factory: Function,
  key: Qualifier,
  metadata: unknown,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = meta as any;
  let pending = obj[PENDING] as PendingEntry[] | undefined;
  if (!pending) {
    pending = [];
    obj[PENDING] = pending;
  }
  pending.push({ factory, key, metadata });
}

/** Flush all pending entries from a DecoratorMetadata object into the member store. */
function flushPending(meta: DecoratorMetadata, target: Function): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = meta as any;
  const pending = obj[PENDING] as PendingEntry[] | undefined;
  if (pending) {
    for (const entry of pending) {
      pushMemberMeta(entry.factory, target, entry.key, entry.metadata);
    }
    delete obj[PENDING];
  }
  obj[FLUSHED] = true;
}

/**
 * Ensure any pending TC39 metadata for `target` is flushed.
 * Checks `target[Symbol.metadata]` for unflushed entries.
 */
function ensureFlushed(target: Function): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (target as any)[Symbol.metadata] as DecoratorMetadata | undefined;
  if (meta && !(meta as Record<symbol, unknown>)[FLUSHED]) {
    flushPending(meta, target);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a target (class constructor or instance) to the class constructor. */
function resolveTarget(target: object): Function {
  if (typeof target === 'function') return target;
  return target.constructor;
}

/** Check if an argument is a TC39 class decorator context. */
function isTC39ClassContext(arg: unknown): arg is ClassDecoratorContext {
  return typeof arg === 'object' && arg !== null && (arg as { kind?: string }).kind === 'class';
}

/** Check if an argument is a TC39 method/field/getter/setter decorator context. */
function isTC39MemberContext(
  arg: unknown,
): arg is ClassMethodDecoratorContext | ClassFieldDecoratorContext {
  if (typeof arg !== 'object' || arg === null) return false;
  const kind = (arg as { kind?: string }).kind;
  return kind === 'method' || kind === 'field' || kind === 'getter' || kind === 'setter';
}

// ---------------------------------------------------------------------------
// createClassDecorator
// ---------------------------------------------------------------------------

/**
 * Create a class decorator that stores typed metadata.
 *
 * The returned decorator works with both TC39 and legacy decorator protocols.
 * When applied, it stores `metadata` keyed by `factory` on the target class,
 * readable via `Metadata.of(factory, target)`.
 *
 * The `extra` parameter composes additional decorators. This is how composite
 * decorators work — e.g., a `@Scheduled` that also applies `@Component`.
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata to store.
 * @param extra - Additional class decorators to apply alongside this one.
 *
 * @example
 * ```ts
 * function Tag(tag: string): ClassDecorator<{ tag: string }> {
 *   return createClassDecorator(Tag, { tag });
 * }
 * ```
 */
export function createClassDecorator<T>(
  factory: ClassDecoratorFactory<T>,
  metadata: T,
  extra?: ClassDecorator<unknown>[],
): ClassDecorator<T> {
  const decorator = function (target: Function, context?: ClassDecoratorContext): void {
    pushClassMeta(factory, target, metadata);

    // TC39: flush pending method/field metadata now that we have the class
    if (isTC39ClassContext(context)) {
      flushPending(context.metadata, target);
    }

    if (extra) {
      for (const d of extra) {
        (d as Function)(target, context);
      }
    }
  } as ClassDecorator<T>;

  Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
  return decorator;
}

// ---------------------------------------------------------------------------
// createMethodDecorator
// ---------------------------------------------------------------------------

/**
 * Create a method decorator that stores typed metadata.
 *
 * Works with both TC39 and legacy decorator protocols. In TC39 mode,
 * metadata is stored as pending in `context.metadata` and flushed when
 * a class decorator runs or when `Metadata.of()` queries the target.
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata to store.
 * @param extra - Additional method decorators to apply alongside this one.
 *
 * @example
 * ```ts
 * function RateLimit(opts: { max: number }): MethodDecorator<{ max: number }> {
 *   return createMethodDecorator(RateLimit, opts);
 * }
 * ```
 */
export function createMethodDecorator<T>(
  factory: MethodDecoratorFactory<T>,
  metadata: T,
  extra?: MethodDecorator<unknown>[],
): MethodDecorator<T> {
  const decorator = function (
    target: unknown,
    contextOrKey: ClassMethodDecoratorContext | string | symbol,
    descriptor?: PropertyDescriptor,
  ): void {
    if (isTC39MemberContext(contextOrKey)) {
      // TC39: target is the method function, no class reference available
      const key = contextOrKey.name as Qualifier;
      storePending(contextOrKey.metadata, factory, key, metadata);
    } else {
      // Legacy: target is prototype (instance) or constructor (static)
      const key = contextOrKey as Qualifier;
      const ctor = typeof target === 'function' ? target : (target as object).constructor;
      pushMemberMeta(factory, ctor, key, metadata);
    }

    if (extra) {
      for (const d of extra) {
        (d as Function)(target, contextOrKey, descriptor);
      }
    }
  } as MethodDecorator<T>;

  Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
  return decorator;
}

// ---------------------------------------------------------------------------
// createFieldDecorator
// ---------------------------------------------------------------------------

/**
 * Create a field decorator that stores typed metadata.
 *
 * Same dual-protocol support as {@link createMethodDecorator}.
 * Used by `@kavri/schema` for schema field decorators (`@IsString`, `@IsInteger`, etc.).
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata to store.
 * @param extra - Additional field decorators to apply alongside this one.
 *
 * @example
 * ```ts
 * function Column(type: string): FieldDecorator<{ type: string }> {
 *   return createFieldDecorator(Column, { type });
 * }
 * ```
 */
export function createFieldDecorator<T>(
  factory: FieldDecoratorFactory<T>,
  metadata: T,
  extra?: FieldDecorator<unknown>[],
): FieldDecorator<T> {
  const decorator = function (
    target: unknown,
    contextOrKey: ClassFieldDecoratorContext | string | symbol,
    descriptor?: PropertyDescriptor,
  ): void {
    if (isTC39MemberContext(contextOrKey)) {
      const key = contextOrKey.name as Qualifier;
      storePending(contextOrKey.metadata, factory, key, metadata);
    } else {
      const key = contextOrKey as Qualifier;
      const ctor = typeof target === 'function' ? target : (target as object).constructor;
      pushMemberMeta(factory, ctor, key, metadata);
    }

    if (extra) {
      for (const d of extra) {
        (d as Function)(target, contextOrKey, descriptor);
      }
    }
  } as FieldDecorator<T>;

  Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
  return decorator;
}

// ---------------------------------------------------------------------------
// Metadata API
// ---------------------------------------------------------------------------

/**
 * The Metadata API for reading and writing decorator metadata.
 *
 * All decorators created with `createClassDecorator`, `createMethodDecorator`,
 * or `createFieldDecorator` store typed metadata that can be queried through
 * this API. The decorator factory function itself serves as the metadata key.
 */
export interface MetadataAPI {
  /**
   * Read class-level metadata for a decorator factory on a target.
   * Returns `readonly T[]` because a decorator can be applied multiple times.
   * Works on both class constructors and instances.
   */
  of<T>(factory: ClassDecoratorFactory<T>, target: object): readonly T[];

  /**
   * Read member-level (method/field) metadata for a decorator factory on a target.
   * @param key - The method or field name (string or symbol).
   */
  of<T>(
    factory: MethodDecoratorFactory<T> | FieldDecoratorFactory<T>,
    target: object,
    key: Qualifier,
  ): readonly T[];

  /**
   * Programmatically attach class-level metadata without using decorator syntax.
   * Uses push semantics — appends to the metadata array.
   */
  apply<T>(factory: ClassDecoratorFactory<T>, target: object, metadata: T): void;

  /**
   * Programmatically attach member-level metadata without using decorator syntax.
   */
  apply<T>(
    factory: MethodDecoratorFactory<T> | FieldDecoratorFactory<T>,
    target: object,
    key: Qualifier,
    metadata: T,
  ): void;

  /**
   * Get all registered `[constructor, metadata]` pairs for a class decorator factory.
   * Used by subsystems to discover all decorated classes.
   */
  entries<T>(factory: ClassDecoratorFactory<T>): readonly [Function, T][];

  /**
   * Get all registered `[constructor, key, metadata]` triples for a method decorator factory.
   */
  entries<T>(factory: MethodDecoratorFactory<T>): readonly [Function, Qualifier, T][];

  /**
   * Walk the prototype chain and collect metadata from the class and all ancestors.
   * Returns metadata from most-derived to base.
   */
  lookup<T>(factory: ClassDecoratorFactory<T>, clazz: Function): readonly T[];

  /**
   * Walk the prototype chain for member-level metadata.
   */
  lookup<T>(
    factory: MethodDecoratorFactory<T> | FieldDecoratorFactory<T>,
    clazz: Function,
    key: Qualifier,
  ): readonly T[];
}

function metadataOf(factory: Function, target: object, key?: Qualifier): readonly unknown[] {
  const ctor = resolveTarget(target);
  ensureFlushed(ctor);
  if (key === undefined) {
    return classStore.get(factory)?.get(ctor) ?? [];
  }
  return memberStore.get(factory)?.get(ctor)?.get(key) ?? [];
}

function metadataApply(
  factory: Function,
  target: object,
  keyOrMetadata: unknown,
  metadata?: unknown,
): void {
  const ctor = resolveTarget(target);
  if (metadata === undefined) {
    pushClassMeta(factory, ctor, keyOrMetadata);
  } else {
    pushMemberMeta(factory, ctor, keyOrMetadata as Qualifier, metadata);
  }
}

function metadataEntries(factory: Function): readonly unknown[] {
  const cm = classStore.get(factory);
  if (cm) {
    const result: [Function, unknown][] = [];
    for (const [ctor, items] of cm) {
      for (const item of items) {
        result.push([ctor, item]);
      }
    }
    return result;
  }

  const mm = memberStore.get(factory);
  if (mm) {
    const result: [Function, Qualifier, unknown][] = [];
    for (const [ctor, byKey] of mm) {
      for (const [key, items] of byKey) {
        for (const item of items) {
          result.push([ctor, key, item]);
        }
      }
    }
    return result;
  }

  return [];
}

function metadataLookup(factory: Function, clazz: Function, key?: Qualifier): readonly unknown[] {
  const result: unknown[] = [];
  let current: Function | null = clazz;
  while (current && current !== Object && current !== Function) {
    ensureFlushed(current);
    if (key === undefined) {
      const items = classStore.get(factory)?.get(current);
      if (items) result.push(...items);
    } else {
      const items = memberStore.get(factory)?.get(current)?.get(key);
      if (items) result.push(...items);
    }
    const proto = Object.getPrototypeOf(current.prototype);
    current = proto ? proto.constructor : null;
  }
  return result;
}

/** @see {@link MetadataAPI} */
export const Metadata: MetadataAPI = {
  of: metadataOf,
  apply: metadataApply,
  entries: metadataEntries,
  lookup: metadataLookup,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

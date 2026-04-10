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

// ---------------------------------------------------------------------------
// Decorator protocol detection
// ---------------------------------------------------------------------------

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
// MetadataManager
// ---------------------------------------------------------------------------

/**
 * Storage and query API for decorator metadata.
 *
 * All decorators created with `createClassDecorator`, `createMethodDecorator`,
 * or `createFieldDecorator` store typed metadata that can be queried through
 * this API. The decorator factory function itself serves as the metadata key.
 *
 * Metadata is stored in instance-level maps (not global state), so multiple
 * `MetadataManager` instances are isolated from each other.
 */
export class MetadataManager {
  /** Class-level: factory → Map<constructor, metadata[]> */
  readonly #classStore = new WeakMap<Function, Map<Function, unknown[]>>();
  /** Member-level: factory → Map<constructor, Map<key, metadata[]>> */
  readonly #memberStore = new WeakMap<Function, Map<Function, Map<Qualifier, unknown[]>>>();

  /** Push a class-level metadata entry. */
  #pushClassMeta(factory: Function, target: Function, metadata: unknown): void {
    let byTarget = this.#classStore.get(factory);
    if (!byTarget) {
      byTarget = new Map();
      this.#classStore.set(factory, byTarget);
    }
    let items = byTarget.get(target);
    if (!items) {
      items = [];
      byTarget.set(target, items);
    }
    items.push(metadata);
  }

  /** Push a member-level (method/field) metadata entry. */
  #pushMemberMeta(factory: Function, target: Function, key: Qualifier, metadata: unknown): void {
    let byTarget = this.#memberStore.get(factory);
    if (!byTarget) {
      byTarget = new Map();
      this.#memberStore.set(factory, byTarget);
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

  /** Flush all pending entries from a DecoratorMetadata object into the member store. */
  #flushPending(meta: DecoratorMetadata, target: Function): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = meta as any;
    const pending = obj[PENDING] as PendingEntry[] | undefined;
    if (pending) {
      for (const entry of pending) {
        this.#pushMemberMeta(entry.factory, target, entry.key, entry.metadata);
      }
      delete obj[PENDING];
    }
    obj[FLUSHED] = true;
  }

  /** Ensure any pending TC39 metadata for `target` is flushed. */
  #ensureFlushed(target: Function): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (target as any)[Symbol.metadata] as DecoratorMetadata | undefined;
    if (meta && !(meta as Record<symbol, unknown>)[FLUSHED]) {
      this.#flushPending(meta, target);
    }
  }

  /** Resolve a target (class constructor or instance) to the class constructor. */
  #resolveTarget(target: object): Function {
    if (typeof target === 'function') return target;
    return target.constructor;
  }

  // -------------------------------------------------------------------------
  // Decorator factories
  // -------------------------------------------------------------------------

  /**
   * Create a class decorator that stores typed metadata.
   *
   * The returned decorator works with both TC39 and legacy decorator protocols.
   * The `extra` parameter composes additional decorators (e.g., `@Scheduled` also applies `@Component`).
   *
   * @param factory - The decorator factory function. Serves as the metadata key.
   * @param metadata - The typed metadata to store.
   * @param extra - Additional class decorators to apply alongside this one.
   *
   * @example
   * ```ts
   * function Tag(tag: string): ClassDecorator<{ tag: string }> {
   *   return Metadata.createClassDecorator(Tag, { tag });
   * }
   * ```
   */
  createClassDecorator<T>(
    factory: ClassDecoratorFactory<T>,
    metadata: T,
    extra?: ClassDecorator<unknown>[],
  ): ClassDecorator<T> {
    const decorator = ((target: Function, context?: ClassDecoratorContext): void => {
      this.#pushClassMeta(factory, target, metadata);

      // TC39: flush pending method/field metadata now that we have the class
      if (isTC39ClassContext(context)) {
        this.#flushPending(context.metadata, target);
      }

      if (extra) {
        for (const d of extra) {
          (d as Function)(target, context);
        }
      }
    }) as ClassDecorator<T>;

    Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
    return decorator;
  }

  /**
   * Create a method decorator that stores typed metadata.
   *
   * In TC39 mode, metadata is stored as pending in `context.metadata` and flushed
   * when a class decorator runs or when `of()` queries the target.
   *
   * @param factory - The decorator factory function. Serves as the metadata key.
   * @param metadata - The typed metadata to store.
   * @param extra - Additional method decorators to apply alongside this one.
   */
  createMethodDecorator<T>(
    factory: MethodDecoratorFactory<T>,
    metadata: T,
    extra?: MethodDecorator<unknown>[],
  ): MethodDecorator<T> {
    const decorator = ((
      target: unknown,
      contextOrKey: ClassMethodDecoratorContext | string | symbol,
      descriptor?: PropertyDescriptor,
    ): void => {
      if (isTC39MemberContext(contextOrKey)) {
        const key = contextOrKey.name as Qualifier;
        storePending(contextOrKey.metadata, factory, key, metadata);
      } else {
        const key = contextOrKey as Qualifier;
        const ctor = typeof target === 'function' ? target : (target as object).constructor;
        this.#pushMemberMeta(factory, ctor, key, metadata);
      }

      if (extra) {
        for (const d of extra) {
          (d as Function)(target, contextOrKey, descriptor);
        }
      }
    }) as MethodDecorator<T>;

    Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
    return decorator;
  }

  /**
   * Create a field decorator that stores typed metadata.
   * Same dual-protocol support as {@link createMethodDecorator}.
   *
   * @param factory - The decorator factory function. Serves as the metadata key.
   * @param metadata - The typed metadata to store.
   * @param extra - Additional field decorators to apply alongside this one.
   */
  createFieldDecorator<T>(
    factory: FieldDecoratorFactory<T>,
    metadata: T,
    extra?: FieldDecorator<unknown>[],
  ): FieldDecorator<T> {
    const decorator = ((
      target: unknown,
      contextOrKey: ClassFieldDecoratorContext | string | symbol,
      descriptor?: PropertyDescriptor,
    ): void => {
      if (isTC39MemberContext(contextOrKey)) {
        const key = contextOrKey.name as Qualifier;
        storePending(contextOrKey.metadata, factory, key, metadata);
      } else {
        const key = contextOrKey as Qualifier;
        const ctor = typeof target === 'function' ? target : (target as object).constructor;
        this.#pushMemberMeta(factory, ctor, key, metadata);
      }

      if (extra) {
        for (const d of extra) {
          (d as Function)(target, contextOrKey, descriptor);
        }
      }
    }) as FieldDecorator<T>;

    Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
    return decorator;
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

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
  of(factory: Function, target: object, key?: Qualifier): readonly unknown[] {
    const ctor = this.#resolveTarget(target);
    this.#ensureFlushed(ctor);
    if (key === undefined) {
      return this.#classStore.get(factory)?.get(ctor) ?? [];
    }
    return this.#memberStore.get(factory)?.get(ctor)?.get(key) ?? [];
  }

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
  apply(factory: Function, target: object, keyOrMetadata: unknown, metadata?: unknown): void {
    const ctor = this.#resolveTarget(target);
    if (metadata === undefined) {
      this.#pushClassMeta(factory, ctor, keyOrMetadata);
    } else {
      this.#pushMemberMeta(factory, ctor, keyOrMetadata as Qualifier, metadata);
    }
  }

  /**
   * Get all registered `[constructor, metadata]` pairs for a class decorator factory.
   * Used by subsystems to discover all decorated classes.
   */
  entries<T>(factory: ClassDecoratorFactory<T>): readonly [Function, T][];
  /**
   * Get all registered `[constructor, key, metadata]` triples for a method decorator factory.
   */
  entries<T>(factory: MethodDecoratorFactory<T>): readonly [Function, Qualifier, T][];
  entries(factory: Function): readonly unknown[] {
    const cm = this.#classStore.get(factory);
    if (cm) {
      const result: [Function, unknown][] = [];
      for (const [ctor, items] of cm) {
        for (const item of items) {
          result.push([ctor, item]);
        }
      }
      return result;
    }

    const mm = this.#memberStore.get(factory);
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
  lookup(factory: Function, clazz: Function, key?: Qualifier): readonly unknown[] {
    const result: unknown[] = [];
    let current: Function | null = clazz;
    while (current && current !== Object && current !== Function) {
      this.#ensureFlushed(current);
      if (key === undefined) {
        const items = this.#classStore.get(factory)?.get(current);
        if (items) result.push(...items);
      } else {
        const items = this.#memberStore.get(factory)?.get(current)?.get(key);
        if (items) result.push(...items);
      }
      const proto = Object.getPrototypeOf(current.prototype);
      current = proto ? proto.constructor : null;
    }
    return result;
  }
}

/**
 * The global metadata manager. All decorator metadata in the application
 * is stored and queried through this instance.
 */
export const Metadata = /* @__PURE__ */ new MetadataManager();

/**
 * Create a class decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataManager.createClassDecorator}
 */
export const createClassDecorator = /* @__PURE__ */ Metadata.createClassDecorator.bind(Metadata);

/**
 * Create a method decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataManager.createMethodDecorator}
 */
export const createMethodDecorator = /* @__PURE__ */ Metadata.createMethodDecorator.bind(Metadata);

/**
 * Create a field decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataManager.createFieldDecorator}
 */
export const createFieldDecorator = /* @__PURE__ */ Metadata.createFieldDecorator.bind(Metadata);

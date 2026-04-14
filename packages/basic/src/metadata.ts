/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  AnyConstructor,
  AnyDecorator,
  AnyDecoratorFactory,
  ClassDecorator,
  ClassDecoratorFactory,
  DecoratorMap,
  FieldDecorator,
  FieldDecoratorFactory,
  MethodDecorator,
  MethodDecoratorFactory,
  Qualifier,
} from './types.js';

// ---------------------------------------------------------------------------
// Decorated entries — query results
// ---------------------------------------------------------------------------

/**
 * Base shape for all decorated entry query results.
 */
export interface DecoratedEntryBase<T, R = any> {
  /**
   * The decorator kind: 'class', 'method', or 'field'.
   */
  kind: string;
  /**
   * The class constructor the decorator was applied to.
   */
  target: AnyConstructor<R>;
  /**
   * The factory function that created this decorator.
   */
  factory: AnyDecoratorFactory<T>;
  /**
   * The metadata value stored by the decorator.
   */
  metadata: T;
}

/**
 * Entry for a class decorator application.
 */
export interface ClassDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'class';
}

/**
 * Entry for a method decorator application.
 */
export interface MethodDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'method';
  /**
   * The method name the decorator was applied to.
   */
  method: keyof R;
}

/**
 * Entry for a field decorator application.
 */
export interface FieldDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'field';
  /**
   * The field name the decorator was applied to.
   */
  field: keyof R;
}

/**
 * Union of all decorated entry types.
 */
export type DecoratedEntry<T, R = any> =
  | ClassDecoratedEntry<T, R>
  | MethodDecoratedEntry<T, R>
  | FieldDecoratedEntry<T, R>;

/**
 * Extract a specific entry kind from {@link DecoratedEntry}.
 */
export type DecoratedEntryOf<
  T,
  R = any,
  Kind extends DecoratedEntry<T, R>['kind'] = DecoratedEntry<T, R>['kind'],
> = Extract<DecoratedEntry<T, R>, { kind: Kind }>;

// ---------------------------------------------------------------------------
// Compose options
// ---------------------------------------------------------------------------

/**
 * Options for composing additional decorators alongside the primary one.
 */
export interface ComposeOptions<T, Kind extends keyof DecoratorMap<T>> {
  /**
   * Additional same-kind decorators to apply on the same target.
   */
  self?: readonly AnyDecorator<unknown, Kind>[];
  /**
   * Class decorators to apply on the same class.
   */
  classes?: readonly ClassDecorator<unknown>[];
  /**
   * Method decorators to apply on the same class: `[methodName, decorator]`.
   */
  methods?: readonly [Qualifier, MethodDecorator<unknown>][];
  /**
   * Field decorators to apply on the same class: `[fieldName, decorator]`.
   */
  fields?: readonly [Qualifier, FieldDecorator<unknown>][];
  /**
   * Class decorators to apply on other classes: `[class, decorator]`.
   */
  otherClass?: readonly [AnyConstructor, ClassDecorator<unknown>][];
  /**
   * Method decorators to apply on other classes: `[class, methodName, decorator]`.
   */
  otherMethods?: readonly [AnyConstructor, Qualifier, MethodDecorator<unknown>][];
  /**
   * Field decorators to apply on other classes: `[class, fieldName, decorator]`.
   */
  otherFields?: readonly [AnyConstructor, Qualifier, FieldDecorator<unknown>][];
  /**
   * Replace the original method with a wrapper (AOP).
   * Only applies to method decorators.
   * @param original - The original method function.
   * @returns The replacement method function.
   */
  proxyMethod?: (original: Function) => Function;
  /**
   * Replace the entire class with a subclass or wrapper.
   * Only applies to class decorators.
   * @param original - The original class constructor.
   * @returns The replacement class constructor.
   */
  proxyClass?: (original: AnyConstructor) => AnyConstructor;
}

// ---------------------------------------------------------------------------
// TC39 pending metadata
// ---------------------------------------------------------------------------

interface PendingEntry {
  factory: Function;
  key: Qualifier;
  metadata: unknown;
  kind: 'method' | 'field';
  compose?: ComposeOptions<any, any>;
}

const PENDING = Symbol('kavri:pending');
const FLUSHED = Symbol('kavri:flushed');

function isTC39ClassContext(arg: unknown): arg is ClassDecoratorContext {
  return typeof arg === 'object' && arg !== null && (arg as any).kind === 'class';
}

function isTC39MemberContext(
  arg: unknown,
): arg is ClassMethodDecoratorContext | ClassFieldDecoratorContext {
  if (typeof arg !== 'object' || arg === null) return false;
  const kind = (arg as any).kind;
  if (kind === 'getter' || kind === 'setter') {
    throw new Error(`Decorators on ${kind}s are not supported`);
  }
  return kind === 'method' || kind === 'field';
}

// ---------------------------------------------------------------------------
// MetadataManager
// ---------------------------------------------------------------------------

/**
 * Storage and query engine for decorator metadata.
 *
 * Use the global {@link Metadata} instance and the bound helpers
 * ({@link createClassDecorator}, {@link createMethodDecorator},
 * {@link createFieldDecorator}, {@link createDecorator}) instead
 * of instantiating this class directly.
 */
export class MetadataManager {
  /**
   * Class-level storage: factory → Map<constructor, entries[]>
   */
  readonly #classStore = new Map<Function, Map<Function, ClassDecoratedEntry<any>[]>>();
  readonly #methodStore = new Map<
    Function,
    Map<Function, Map<Qualifier, MethodDecoratedEntry<any>[]>>
  >();
  readonly #fieldStore = new Map<
    Function,
    Map<Function, Map<Qualifier, FieldDecoratedEntry<any>[]>>
  >();
  readonly #subclassIndex = new Map<Function, Map<Function, Function[]>>();

  // -----------------------------------------------------------------------
  // Internal storage
  // -----------------------------------------------------------------------

  /**
   * Store a class decorator entry. Also indexes the class as a subclass of its ancestors.
   */
  #pushClass(factory: Function, target: Function, entry: ClassDecoratedEntry<any>): void {
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
    items.push(entry);
    this.#indexSubclass(factory, target);
  }

  /**
   * Store a method decorator entry.
   */
  #pushMethod(
    factory: Function,
    target: Function,
    key: Qualifier,
    entry: MethodDecoratedEntry<any>,
  ): void {
    let byTarget = this.#methodStore.get(factory);
    if (!byTarget) {
      byTarget = new Map();
      this.#methodStore.set(factory, byTarget);
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
    items.push(entry);
  }

  /**
   * Store a field decorator entry.
   */
  #pushField(
    factory: Function,
    target: Function,
    key: Qualifier,
    entry: FieldDecoratedEntry<any>,
  ): void {
    let byTarget = this.#fieldStore.get(factory);
    if (!byTarget) {
      byTarget = new Map();
      this.#fieldStore.set(factory, byTarget);
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
    items.push(entry);
  }

  /**
   * Walk the prototype chain and register target as a subclass of each ancestor under factory.
   */
  #indexSubclass(factory: Function, target: Function): void {
    let current = Object.getPrototypeOf(target.prototype);
    while (current && current !== Object.prototype) {
      const superCtor = current.constructor;
      let byFactory = this.#subclassIndex.get(superCtor);
      if (!byFactory) {
        byFactory = new Map();
        this.#subclassIndex.set(superCtor, byFactory);
      }
      let subs = byFactory.get(factory);
      if (!subs) {
        subs = [];
        byFactory.set(factory, subs);
      }
      if (!subs.includes(target)) subs.push(target);
      current = Object.getPrototypeOf(current);
    }
  }

  // -----------------------------------------------------------------------
  // TC39 pending flush
  // -----------------------------------------------------------------------

  /**
   * Store a pending TC39 method/field entry in context.metadata for later flush.
   */
  #storePending(meta: DecoratorMetadata, entry: PendingEntry): void {
    const obj = meta as any;
    let pending = obj[PENDING] as PendingEntry[] | undefined;
    if (!pending) {
      pending = [];
      obj[PENDING] = pending;
    }
    pending.push(entry);
  }

  /**
   * Flush all pending TC39 entries from context.metadata into the stores. Called when the class constructor becomes available.
   */
  #flushPending(meta: DecoratorMetadata, target: Function): void {
    const obj = meta as any;
    const pending = obj[PENDING] as PendingEntry[] | undefined;
    if (pending) {
      for (const p of pending) {
        if (p.kind === 'method') {
          this.#pushMethod(p.factory, target, p.key, {
            kind: 'method',
            target: target as AnyConstructor,
            factory: p.factory as any,
            metadata: p.metadata,
            method: p.key as any,
          });
        } else {
          this.#pushField(p.factory, target, p.key, {
            kind: 'field',
            target: target as AnyConstructor,
            factory: p.factory as any,
            metadata: p.metadata,
            field: p.key as any,
          });
        }
        if (p.compose) this.#applyCompose(p.compose, target, p.kind, p.key);
      }
      delete obj[PENDING];
    }
    obj[FLUSHED] = true;
  }

  /**
   * Resolve target to constructor. Returns undefined if target is undefined.
   */
  #resolve(target: any): Function | undefined {
    if (target === undefined) return undefined;
    if (typeof target === 'function') return target;
    return target.constructor;
  }

  /**
   * Ensure any pending TC39 entries for target are flushed. Checks Symbol.metadata.
   */
  #ensureFlushed(target: Function): void {
    const meta = (target as any)[Symbol.metadata] as DecoratorMetadata | undefined;
    if (meta && !(meta as Record<symbol, unknown>)[FLUSHED]) {
      this.#flushPending(meta, target);
    }
  }

  // -----------------------------------------------------------------------
  // Compose options processing
  // -----------------------------------------------------------------------

  /**
   * Apply all compose options: self, classes, methods, fields, other*, proxyMethod, proxyClass.
   */
  #applyCompose(
    compose: ComposeOptions<any, any>,
    target: Function,
    kind: string,
    key?: Qualifier,
  ): void {
    if (compose.self) {
      for (const d of compose.self) {
        if (kind === 'class') (d as Function)(target);
        else if (key !== undefined) (d as Function)(target.prototype, key);
      }
    }
    if (compose.classes) {
      for (const d of compose.classes) (d as Function)(target);
    }
    if (compose.methods) {
      for (const [k, d] of compose.methods) (d as Function)(target.prototype, k);
    }
    if (compose.fields) {
      for (const [k, d] of compose.fields) (d as Function)(target.prototype, k);
    }
    if (compose.otherClass) {
      for (const [cls, d] of compose.otherClass) (d as Function)(cls);
    }
    if (compose.otherMethods) {
      for (const [cls, k, d] of compose.otherMethods) (d as Function)(cls.prototype, k);
    }
    if (compose.otherFields) {
      for (const [cls, k, d] of compose.otherFields) (d as Function)(cls.prototype, k);
    }
  }

  // -----------------------------------------------------------------------
  // createDecorator
  // -----------------------------------------------------------------------

  /**
   * @see {@link createDecorator}
   */
  createDecorator<T, Kind extends keyof DecoratorMap<T>>(
    kinds: readonly Kind[],
    factory: AnyDecoratorFactory<T, Kind>,
    metadata: T,
    extra?: ComposeOptions<T, Kind>,
  ): AnyDecorator<T, Kind> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const mgr = this;
    const allowed = new Set<string>(kinds);

    const decorator = function (
      target: any,
      contextOrKey?: any,
      descriptor?: PropertyDescriptor,
    ): any {
      if (isTC39ClassContext(contextOrKey)) {
        if (!allowed.has('class')) {
          throw new Error(`Decorator cannot be applied to a class`);
        }
        // TC39 class
        mgr.#pushClass(factory as Function, target, {
          kind: 'class',
          target: target as AnyConstructor,
          factory: factory as any,
          metadata,
        });
        mgr.#flushPending(contextOrKey.metadata, target);
        if (extra) mgr.#applyCompose(extra, target, 'class');
        if ((extra as any)?.proxyClass) {
          return (extra as any).proxyClass(target);
        }
      } else if (isTC39MemberContext(contextOrKey)) {
        // TC39 method/field
        const key = contextOrKey.name as Qualifier;
        const kind = contextOrKey.kind === 'field' ? 'field' : 'method';
        if (!allowed.has(kind)) {
          throw new Error(`Decorator cannot be applied to a ${kind}`);
        }
        mgr.#storePending(contextOrKey.metadata, {
          factory: factory as Function,
          key,
          metadata,
          kind: kind as 'method' | 'field',
          compose: extra,
        });
        if ((extra as any)?.proxyMethod && kind === 'method') {
          return (extra as any).proxyMethod(target);
        }
      } else if (contextOrKey === undefined) {
        if (!allowed.has('class')) {
          throw new Error(`Decorator cannot be applied to a class`);
        }
        // Legacy class
        mgr.#pushClass(factory as Function, target, {
          kind: 'class',
          target: target as AnyConstructor,
          factory: factory as any,
          metadata,
        });
        if (extra) mgr.#applyCompose(extra, target, 'class');
        if ((extra as any)?.proxyClass) {
          return (extra as any).proxyClass(target);
        }
      } else {
        // Legacy method/field
        const key = contextOrKey as Qualifier;
        const ctor = typeof target === 'function' ? target : target.constructor;
        if (descriptor && !('value' in descriptor)) {
          throw new Error('Decorators on getters/setters are not supported');
        }
        const kind = descriptor ? 'method' : 'field';
        if (!allowed.has(kind)) {
          throw new Error(`Decorator cannot be applied to a ${kind}`);
        }
        if (kind === 'method') {
          mgr.#pushMethod(factory as Function, ctor, key, {
            kind: 'method',
            target: ctor as AnyConstructor,
            factory: factory as any,
            metadata,
            method: key as any,
          });
          if (extra) mgr.#applyCompose(extra, ctor, 'method', key);
          if ((extra as any)?.proxyMethod && descriptor) {
            descriptor.value = (extra as any).proxyMethod(descriptor.value);
          }
        } else {
          mgr.#pushField(factory as Function, ctor, key, {
            kind: 'field',
            target: ctor as AnyConstructor,
            factory: factory as any,
            metadata,
            field: key as any,
          });
          if (extra) mgr.#applyCompose(extra, ctor, 'field', key);
        }
      }
    } as AnyDecorator<T, Kind>;

    Object.defineProperty(decorator, 'metadata', { value: metadata, writable: false });
    return decorator;
  }

  // -----------------------------------------------------------------------
  // Convenience wrappers
  // -----------------------------------------------------------------------

  /**
   * @see {@link createClassDecorator}
   */
  createClassDecorator<T>(
    factory: ClassDecoratorFactory<T>,
    metadata: T,
    extra?: ComposeOptions<T, 'class'>,
  ): ClassDecorator<T> {
    return this.createDecorator(['class'], factory, metadata, extra);
  }

  /**
   * @see {@link createMethodDecorator}
   */
  createMethodDecorator<T>(
    factory: MethodDecoratorFactory<T>,
    metadata: T,
    extra?: ComposeOptions<T, 'method'>,
  ): MethodDecorator<T> {
    return this.createDecorator(['method'], factory, metadata, extra);
  }

  /**
   * @see {@link createFieldDecorator}
   */
  createFieldDecorator<T>(
    factory: FieldDecoratorFactory<T>,
    metadata: T,
    extra?: ComposeOptions<T, 'field'>,
  ): FieldDecorator<T> {
    return this.createDecorator(['field'], factory, metadata, extra);
  }

  // -----------------------------------------------------------------------
  // Query API — all O(1) via Map lookups
  // -----------------------------------------------------------------------

  /**
   * Query class decorator entries.
   *
   * - `ofClass(factory)` — returns all classes decorated by this factory: `Map<AnyConstructor, entries[]>`
   * - `ofClass(factory, target)` — returns entries for a specific class (or instance): `entries[]`
   *
   * @example
   * ```ts
   * Metadata.ofClass(Tag);           // Map of all @Tag-decorated classes
   * Metadata.ofClass(Tag, Foo);      // entries for Foo
   * Metadata.ofClass(Tag, fooInst);  // entries for fooInst's class
   * ```
   */
  ofClass<T>(
    factory: ClassDecoratorFactory<T>,
  ): Map<AnyConstructor, readonly ClassDecoratedEntry<T>[]>;
  ofClass<T, R extends object>(
    factory: ClassDecoratorFactory<T>,
    target: AnyConstructor<R> | R,
  ): readonly ClassDecoratedEntry<T, R>[];
  ofClass(factory: Function, target?: any): any {
    const ctor = this.#resolve(target);
    if (ctor) this.#ensureFlushed(ctor);
    const byTarget = this.#classStore.get(factory);
    if (!byTarget) return ctor ? [] : new Map();
    if (ctor) return byTarget.get(ctor) ?? [];
    return byTarget;
  }

  /**
   * Query method decorator entries.
   *
   * - `ofMethod(factory)` — all classes + methods: `Map<AnyConstructor, Map<Qualifier, entries[]>>`
   * - `ofMethod(factory, target)` — methods on a class (or instance): `Map<Qualifier, entries[]>`
   * - `ofMethod(factory, target, qualifier)` — entries for a specific method: `entries[]`
   *
   * @example
   * ```ts
   * Metadata.ofMethod(Marker, Foo, 'hello'); // entries for Foo.hello
   * ```
   */
  ofMethod<T>(
    factory: MethodDecoratorFactory<T>,
  ): Map<AnyConstructor, Map<Qualifier, readonly MethodDecoratedEntry<T>[]>>;
  ofMethod<T, R extends object>(
    factory: MethodDecoratorFactory<T>,
    target: AnyConstructor<R> | R,
  ): Map<Qualifier, readonly MethodDecoratedEntry<T, R>[]>;
  ofMethod<T, R extends object>(
    factory: MethodDecoratorFactory<T>,
    target: AnyConstructor<R> | R,
    qualifier: Qualifier,
  ): readonly MethodDecoratedEntry<T, R>[];
  ofMethod(factory: Function, target?: any, qualifier?: Qualifier): any {
    const ctor = this.#resolve(target);
    if (ctor) this.#ensureFlushed(ctor);
    const byTarget = this.#methodStore.get(factory);
    if (!byTarget) return ctor ? (qualifier !== undefined ? [] : new Map()) : new Map();
    if (!ctor) return byTarget;
    const byKey = byTarget.get(ctor);
    if (!byKey) return qualifier !== undefined ? [] : new Map();
    if (qualifier !== undefined) return byKey.get(qualifier) ?? [];
    return byKey;
  }

  /**
   * Query field decorator entries.
   *
   * - `ofField(factory)` — all classes + fields: `Map<AnyConstructor, Map<Qualifier, entries[]>>`
   * - `ofField(factory, target)` — fields on a class (or instance): `Map<Qualifier, entries[]>`
   * - `ofField(factory, target, qualifier)` — entries for a specific field: `entries[]`
   *
   * @example
   * ```ts
   * Metadata.ofField(FieldType, Foo, 'name'); // entries for Foo.name
   * ```
   */
  ofField<T>(
    factory: FieldDecoratorFactory<T>,
  ): Map<AnyConstructor, Map<Qualifier, readonly FieldDecoratedEntry<T>[]>>;
  ofField<T, R extends object>(
    factory: FieldDecoratorFactory<T>,
    target: AnyConstructor<R> | R,
  ): Map<Qualifier, readonly FieldDecoratedEntry<T, R>[]>;
  ofField<T, R extends object>(
    factory: FieldDecoratorFactory<T>,
    target: AnyConstructor<R> | R,
    qualifier: Qualifier,
  ): readonly FieldDecoratedEntry<T, R>[];
  ofField(factory: Function, target?: any, qualifier?: Qualifier): any {
    const ctor = this.#resolve(target);
    if (ctor) this.#ensureFlushed(ctor);
    const byTarget = this.#fieldStore.get(factory);
    if (!byTarget) return ctor ? (qualifier !== undefined ? [] : new Map()) : new Map();
    if (!ctor) return byTarget;
    const byKey = byTarget.get(ctor);
    if (!byKey) return qualifier !== undefined ? [] : new Map();
    if (qualifier !== undefined) return byKey.get(qualifier) ?? [];
    return byKey;
  }

  /**
   * Find all decorated subclasses of `superTarget` for a given class decorator factory.
   * O(1) lookup — the index is built when decorators are applied.
   *
   * @param factory - The class decorator factory to filter by.
   * @param superTarget - The ancestor class to search subclasses of.
   * @returns Array of decorated subclass constructors.
   *
   * @example
   * ```ts
   * class Base {}
   * @Component() class Child extends Base {}
   * Metadata.subclassesOf(Component, Base); // [Child]
   * ```
   */
  subclassesOf<T, R>(
    factory: ClassDecoratorFactory<T>,
    superTarget: AnyConstructor<R>,
  ): readonly AnyConstructor<R>[] {
    const byFactory = this.#subclassIndex.get(superTarget);
    if (!byFactory) return [];
    return (byFactory.get(factory) ?? []) as AnyConstructor<R>[];
  }
}

// ---------------------------------------------------------------------------
// Global instance + bound helpers
// ---------------------------------------------------------------------------

/**
 * The global {@link MetadataManager} instance.
 *
 * All decorator metadata in the application is stored and queried through
 * this singleton. Use `Metadata.ofClass()`, `Metadata.ofMethod()`, and
 * `Metadata.ofField()` to query decorated entries.
 *
 * For most use cases, use the global helpers (`createClassDecorator`, etc.)
 * instead of calling `Metadata.createClassDecorator()` directly — they are
 * equivalent but shorter.
 *
 * @example
 * ```ts
 * // Query all classes decorated with @Tag
 * const all = Metadata.ofClass(Tag);
 *
 * // Query entries for a specific class
 * const entries = Metadata.ofClass(Tag, Foo);
 * ```
 */
export const Metadata = /* @__PURE__ */ new MetadataManager();

/**
 * Create a class decorator that stores typed metadata in the global
 * {@link Metadata} store.
 *
 * The returned decorator supports both TC39 and legacy protocols.
 * The `factory` function serves as the metadata key for later queries
 * via `Metadata.ofClass(factory, target)`.
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata value to store when the decorator is applied.
 * @param extra - Additional decorators and composition options. See {@link ComposeOptions}.
 * @returns A decorator with a readonly `metadata` static property.
 *
 * @example
 * ```ts
 * function Component(name?: string) {
 *   return createClassDecorator(Component, { name });
 * }
 *
 * @Component('user-service')
 * class UserService {}
 *
 * Metadata.ofClass(Component, UserService);
 * // [{ kind: 'class', target: UserService, metadata: { name: 'user-service' }, ... }]
 * ```
 */
export const createClassDecorator = /* @__PURE__ */ Metadata.createClassDecorator.bind(Metadata);

/**
 * Create a method decorator that stores typed metadata in the global
 * {@link Metadata} store.
 *
 * The returned decorator supports both TC39 and legacy protocols.
 * In TC39 mode, metadata is stored as pending and flushed when a class
 * decorator runs or when a query method is called.
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata value to store.
 * @param extra - Additional decorators and composition options. See {@link ComposeOptions}.
 *   Supports `proxyMethod` for AOP wrapping.
 * @returns A decorator with a readonly `metadata` static property.
 *
 * @example
 * ```ts
 * function Log(level: string) {
 *   return createMethodDecorator(Log, { level });
 * }
 *
 * class Service {
 *   @Log('info')
 *   process() {}
 * }
 *
 * Metadata.ofMethod(Log, Service, 'process');
 * // [{ kind: 'method', target: Service, method: 'process', metadata: { level: 'info' }, ... }]
 * ```
 */
export const createMethodDecorator = /* @__PURE__ */ Metadata.createMethodDecorator.bind(Metadata);

/**
 * Create a field decorator that stores typed metadata in the global
 * {@link Metadata} store.
 *
 * The returned decorator supports both TC39 and legacy protocols.
 * In TC39 mode, metadata is stored as pending and flushed when a class
 * decorator runs or when a query method is called.
 *
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata value to store.
 * @param extra - Additional decorators and composition options. See {@link ComposeOptions}.
 * @returns A decorator with a readonly `metadata` static property.
 *
 * @example
 * ```ts
 * function Column(type: string) {
 *   return createFieldDecorator(Column, { type });
 * }
 *
 * class User {
 *   @Column('varchar')
 *   name!: string;
 * }
 *
 * Metadata.ofField(Column, User, 'name');
 * // [{ kind: 'field', target: User, field: 'name', metadata: { type: 'varchar' }, ... }]
 * ```
 */
export const createFieldDecorator = /* @__PURE__ */ Metadata.createFieldDecorator.bind(Metadata);

/**
 * Create a multi-kind decorator that supports one or more of
 * class/method/field targets. Bound to the global {@link Metadata} store.
 *
 * Use this when a single decorator factory should work on multiple
 * target kinds. The `kinds` parameter controls which are allowed —
 * applying to an unsupported kind throws at decoration time.
 *
 * @param kinds - Array of allowed kinds: `['class']`, `['method', 'field']`, etc.
 * @param factory - The decorator factory function. Serves as the metadata key.
 * @param metadata - The typed metadata value to store.
 * @param extra - Additional decorators and composition options. See {@link ComposeOptions}.
 * @returns A decorator with a readonly `metadata` static property.
 *
 * @example
 * ```ts
 * function Deprecated(reason: string) {
 *   return createDecorator(['class', 'method'], Deprecated, { reason });
 * }
 * ```
 */
export const createDecorator = /* @__PURE__ */ Metadata.createDecorator.bind(Metadata);

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

/** Base shape for all decorated entry query results. */
export interface DecoratedEntryBase<T, R = any> {
  /** The decorator kind: 'class', 'method', or 'field'. */
  kind: string;
  /** The class constructor the decorator was applied to. */
  target: AnyConstructor<R>;
  /** The factory function that created this decorator. */
  factory: AnyDecoratorFactory<T>;
  /** The metadata value stored by the decorator. */
  metadata: T;
}

/** Entry for a class decorator application. */
export interface ClassDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'class';
}

/** Entry for a method decorator application. */
export interface MethodDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'method';
  /** The method name the decorator was applied to. */
  method: keyof R;
}

/** Entry for a field decorator application. */
export interface FieldDecoratedEntry<T, R = any> extends DecoratedEntryBase<T, R> {
  kind: 'field';
  /** The field name the decorator was applied to. */
  field: keyof R;
}

/** Union of all decorated entry types. */
export type DecoratedEntry<T, R = any> =
  | ClassDecoratedEntry<T, R>
  | MethodDecoratedEntry<T, R>
  | FieldDecoratedEntry<T, R>;

/** Extract a specific entry kind from {@link DecoratedEntry}. */
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
  /** Additional same-kind decorators to apply on the same target. */
  self?: readonly AnyDecorator<unknown, Kind>[];
  /** Class decorators to apply on the same class. */
  classes?: readonly ClassDecorator<unknown>[];
  /** Method decorators to apply on the same class: `[methodName, decorator]`. */
  methods?: readonly [Qualifier, MethodDecorator<unknown>][];
  /** Field decorators to apply on the same class: `[fieldName, decorator]`. */
  fields?: readonly [Qualifier, FieldDecorator<unknown>][];
  /** Class decorators to apply on other classes: `[class, decorator]`. */
  otherClass?: readonly [AnyConstructor, ClassDecorator<unknown>][];
  /** Method decorators to apply on other classes: `[class, methodName, decorator]`. */
  otherMethods?: readonly [AnyConstructor, Qualifier, MethodDecorator<unknown>][];
  /** Field decorators to apply on other classes: `[class, fieldName, decorator]`. */
  otherFields?: readonly [AnyConstructor, Qualifier, FieldDecorator<unknown>][];
  /** Replace the original method/function with a wrapper (AOP). */
  aspect?: (original: Function) => Function;
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

export class MetadataManager {
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

  #storePending(meta: DecoratorMetadata, entry: PendingEntry): void {
    const obj = meta as any;
    let pending = obj[PENDING] as PendingEntry[] | undefined;
    if (!pending) {
      pending = [];
      obj[PENDING] = pending;
    }
    pending.push(entry);
  }

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

  #ensureFlushed(target: Function): void {
    const meta = (target as any)[Symbol.metadata] as DecoratorMetadata | undefined;
    if (meta && !(meta as Record<symbol, unknown>)[FLUSHED]) {
      this.#flushPending(meta, target);
    }
  }

  // -----------------------------------------------------------------------
  // Compose options processing
  // -----------------------------------------------------------------------

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

  createDecorator<T, Kind extends keyof DecoratorMap<T>>(
    _kinds: readonly Kind[],
    factory: AnyDecoratorFactory<T, Kind>,
    metadata: T,
    extra?: ComposeOptions<T, Kind>,
  ): AnyDecorator<T, Kind> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const mgr = this;

    const decorator = function (
      target: any,
      contextOrKey?: any,
      descriptor?: PropertyDescriptor,
    ): any {
      if (isTC39ClassContext(contextOrKey)) {
        // TC39 class
        mgr.#pushClass(factory as Function, target, {
          kind: 'class',
          target: target as AnyConstructor,
          factory: factory as any,
          metadata,
        });
        mgr.#flushPending(contextOrKey.metadata, target);
        if (extra) mgr.#applyCompose(extra, target, 'class');
      } else if (isTC39MemberContext(contextOrKey)) {
        // TC39 method/field
        const key = contextOrKey.name as Qualifier;
        const kind = contextOrKey.kind === 'field' ? 'field' : 'method';
        mgr.#storePending(contextOrKey.metadata, {
          factory: factory as Function,
          key,
          metadata,
          kind: kind as 'method' | 'field',
          compose: extra,
        });
        if ((extra as any)?.aspect && kind === 'method') {
          return (extra as any).aspect(target);
        }
      } else if (contextOrKey === undefined) {
        // Legacy class
        mgr.#pushClass(factory as Function, target, {
          kind: 'class',
          target: target as AnyConstructor,
          factory: factory as any,
          metadata,
        });
        if (extra) mgr.#applyCompose(extra, target, 'class');
      } else {
        // Legacy method/field
        const key = contextOrKey as Qualifier;
        const ctor = typeof target === 'function' ? target : target.constructor;
        if (descriptor && !('value' in descriptor)) {
          throw new Error('Decorators on getters/setters are not supported');
        }
        const kind = descriptor ? 'method' : 'field';
        if (kind === 'method') {
          mgr.#pushMethod(factory as Function, ctor, key, {
            kind: 'method',
            target: ctor as AnyConstructor,
            factory: factory as any,
            metadata,
            method: key as any,
          });
          if (extra) mgr.#applyCompose(extra, ctor, 'method', key);
          if ((extra as any)?.aspect && descriptor) {
            descriptor.value = (extra as any).aspect(descriptor.value);
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

  createClassDecorator<T>(
    factory: ClassDecoratorFactory<T>,
    metadata: T,
    extra?: ComposeOptions<T, 'class'>,
  ): ClassDecorator<T> {
    return this.createDecorator(['class'], factory, metadata, extra);
  }

  createMethodDecorator<T>(
    factory: MethodDecoratorFactory<T>,
    metadata: T,
    extra?: ComposeOptions<T, 'method'>,
  ): MethodDecorator<T> {
    return this.createDecorator(['method'], factory, metadata, extra);
  }

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

  ofClass<T>(
    factory: ClassDecoratorFactory<T>,
  ): Map<AnyConstructor, readonly ClassDecoratedEntry<T>[]>;
  ofClass<T, R>(
    factory: ClassDecoratorFactory<T>,
    target: AnyConstructor<R>,
  ): readonly ClassDecoratedEntry<T, R>[];
  ofClass(factory: Function, target?: Function): any {
    if (target) this.#ensureFlushed(target);
    const byTarget = this.#classStore.get(factory);
    if (!byTarget) return target ? [] : new Map();
    if (target) return byTarget.get(target) ?? [];
    return byTarget;
  }

  ofMethod<T>(
    factory: MethodDecoratorFactory<T>,
  ): Map<AnyConstructor, Map<Qualifier, readonly MethodDecoratedEntry<T>[]>>;
  ofMethod<T, R>(
    factory: MethodDecoratorFactory<T>,
    target: AnyConstructor<R>,
  ): Map<Qualifier, readonly MethodDecoratedEntry<T, R>[]>;
  ofMethod<T, R>(
    factory: MethodDecoratorFactory<T>,
    target: AnyConstructor<R>,
    qualifier: Qualifier,
  ): readonly MethodDecoratedEntry<T, R>[];
  ofMethod(factory: Function, target?: Function, qualifier?: Qualifier): any {
    if (target) this.#ensureFlushed(target);
    const byTarget = this.#methodStore.get(factory);
    if (!byTarget) return target ? (qualifier !== undefined ? [] : new Map()) : new Map();
    if (!target) return byTarget;
    const byKey = byTarget.get(target);
    if (!byKey) return qualifier !== undefined ? [] : new Map();
    if (qualifier !== undefined) return byKey.get(qualifier) ?? [];
    return byKey;
  }

  ofField<T>(
    factory: FieldDecoratorFactory<T>,
  ): Map<AnyConstructor, Map<Qualifier, readonly FieldDecoratedEntry<T>[]>>;
  ofField<T, R>(
    factory: FieldDecoratorFactory<T>,
    target: AnyConstructor<R>,
  ): Map<Qualifier, readonly FieldDecoratedEntry<T, R>[]>;
  ofField<T, R>(
    factory: FieldDecoratorFactory<T>,
    target: AnyConstructor<R>,
    qualifier: Qualifier,
  ): readonly FieldDecoratedEntry<T, R>[];
  ofField(factory: Function, target?: Function, qualifier?: Qualifier): any {
    if (target) this.#ensureFlushed(target);
    const byTarget = this.#fieldStore.get(factory);
    if (!byTarget) return target ? (qualifier !== undefined ? [] : new Map()) : new Map();
    if (!target) return byTarget;
    const byKey = byTarget.get(target);
    if (!byKey) return qualifier !== undefined ? [] : new Map();
    if (qualifier !== undefined) return byKey.get(qualifier) ?? [];
    return byKey;
  }

  /** Find all decorated subclasses of superTarget for a given factory. O(1). */
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

/** The global metadata manager instance. */
export const Metadata = /* @__PURE__ */ new MetadataManager();

/** Create a class decorator bound to the global {@link Metadata}. */
export const createClassDecorator = /* @__PURE__ */ Metadata.createClassDecorator.bind(Metadata);

/** Create a method decorator bound to the global {@link Metadata}. */
export const createMethodDecorator = /* @__PURE__ */ Metadata.createMethodDecorator.bind(Metadata);

/** Create a field decorator bound to the global {@link Metadata}. */
export const createFieldDecorator = /* @__PURE__ */ Metadata.createFieldDecorator.bind(Metadata);

/** Create a multi-kind decorator bound to the global {@link Metadata}. */
export const createDecorator = /* @__PURE__ */ Metadata.createDecorator.bind(Metadata);

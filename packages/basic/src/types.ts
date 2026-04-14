/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A string or symbol used to qualify or identify a named component,
 * method, or field within the metadata system.
 */
export type Qualifier = string | symbol;

/**
 * A value that is either synchronous `T` or an async `Promise<T>`.
 * Used for APIs that accept both sync and async callbacks.
 */
export type Awaitable<T> = T | Promise<T>;

/**
 * Any class constructor, concrete or abstract.
 * Matches both `class Foo {}` and `abstract class Bar {}`.
 */
export type AnyConstructor<T = any> = abstract new (...args: any[]) => T;

/**
 * Static property carried by every Kavri decorator instance.
 * Allows reading the metadata without applying the decorator:
 * `const meta = MyDecorator('arg').metadata;`
 */
export interface DecoratorStatic<T> {
  readonly metadata: T;
}

/**
 * A class decorator that supports both TC39 (stage 3) and legacy
 * TypeScript decorator protocols. Carries typed metadata `T`
 * via the {@link DecoratorStatic.metadata} property.
 */
export type ClassDecorator<T> = globalThis.ClassDecorator &
  ((target: Function, context: ClassDecoratorContext) => void) &
  DecoratorStatic<T>;

/**
 * A method decorator that supports both TC39 (stage 3) and legacy
 * TypeScript decorator protocols. Carries typed metadata `T`
 * via the {@link DecoratorStatic.metadata} property.
 */
export type MethodDecorator<T> = globalThis.MethodDecorator &
  ((target: Function, context: ClassMethodDecoratorContext) => void) &
  DecoratorStatic<T>;

/**
 * A field decorator that supports both TC39 (stage 3) and legacy
 * TypeScript decorator protocols. In legacy mode, uses the same
 * `(target, key, descriptor?)` signature as method decorators.
 * Carries typed metadata `T` via the {@link DecoratorStatic.metadata} property.
 */
export type FieldDecorator<T> = globalThis.MethodDecorator &
  ((value: any, context: ClassFieldDecoratorContext) => void) &
  DecoratorStatic<T>;

/**
 * Factory function that creates a {@link ClassDecorator}.
 * The factory itself serves as the metadata key for querying
 * via `Metadata.ofClass(factory, target)`.
 */
export type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;

/**
 * Factory function that creates a {@link MethodDecorator}.
 * The factory itself serves as the metadata key for querying
 * via `Metadata.ofMethod(factory, target, qualifier)`.
 */
export type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;

/**
 * Factory function that creates a {@link FieldDecorator}.
 * The factory itself serves as the metadata key for querying
 * via `Metadata.ofField(factory, target, qualifier)`.
 */
export type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>;

/**
 * Maps decorator kind names to their corresponding decorator types.
 * Used by {@link AnyDecorator} to compute intersection types for
 * multi-kind decorators.
 */
export interface DecoratorMap<T> {
  class: ClassDecorator<T>;
  method: MethodDecorator<T>;
  field: FieldDecorator<T>;
}

/**
 * Converts a union type `A | B | C` to an intersection type `A & B & C`.
 * Used internally to build multi-kind decorator types.
 */
export type UnionToIntersection<U> = (U extends any ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/**
 * A decorator that supports one or more kinds (class, method, field).
 * When multiple kinds are specified, the type is the intersection of
 * all corresponding decorator types, allowing it to be applied to
 * any of the specified targets.
 *
 * @typeParam T - The metadata type.
 * @typeParam Kind - Which kinds this decorator supports. Defaults to all.
 */
export type AnyDecorator<
  T,
  Kind extends keyof DecoratorMap<T> = keyof DecoratorMap<T>,
> = UnionToIntersection<DecoratorMap<T>[Kind]>;

/**
 * Factory function that creates an {@link AnyDecorator}.
 * The factory itself serves as the metadata key for querying.
 *
 * @typeParam T - The metadata type.
 * @typeParam Kind - Which kinds this decorator supports. Defaults to all.
 */
export type AnyDecoratorFactory<T, Kind extends keyof DecoratorMap<T> = keyof DecoratorMap<T>> = (
  ...args: any[]
) => AnyDecorator<T, Kind>;

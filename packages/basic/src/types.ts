/* eslint-disable @typescript-eslint/no-explicit-any */

/** A string or symbol used to qualify/identify a named component or member. */
export type Qualifier = string | symbol;

/** A value that is either `T` or `Promise<T>`. */
export type Awaitable<T> = T | Promise<T>;

/** Any class constructor (concrete or abstract). */
export type AnyConstructor<T = any> = abstract new (...args: any[]) => T;

/**
 * Static metadata property carried by every Kavri decorator.
 * The `metadata` value is the data passed to the `create*Decorator` factory,
 * accessible without applying the decorator.
 */
export type DecoratorStatic<T> = { readonly metadata: T };

/** A class decorator that works with both TC39 and legacy TypeScript decorator protocols. */
export type ClassDecorator<T> = globalThis.ClassDecorator &
  ((target: Function, context: ClassDecoratorContext) => void) &
  DecoratorStatic<T>;

/** A method decorator that works with both TC39 and legacy TypeScript decorator protocols. */
export type MethodDecorator<T> = globalThis.MethodDecorator &
  ((target: Function, context: ClassMethodDecoratorContext) => void) &
  DecoratorStatic<T>;

/** A field decorator (legacy uses MethodDecorator signature). */
export type FieldDecorator<T> = globalThis.MethodDecorator &
  ((value: any, context: ClassFieldDecoratorContext) => void) &
  DecoratorStatic<T>;

export type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;
export type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;
export type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>;

/** Map of decorator kind → decorator type. */
export interface DecoratorMap<T> {
  class: ClassDecorator<T>;
  method: MethodDecorator<T>;
  field: FieldDecorator<T>;
}

export type UnionToIntersection<U> = (U extends any ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/** A decorator that works for one or more kinds (class/method/field). */
export type AnyDecorator<
  T,
  Kind extends keyof DecoratorMap<T> = keyof DecoratorMap<T>,
> = UnionToIntersection<DecoratorMap<T>[Kind]>;

/** Factory for {@link AnyDecorator}. */
export type AnyDecoratorFactory<T, Kind extends keyof DecoratorMap<T> = keyof DecoratorMap<T>> = (
  ...args: any[]
) => AnyDecorator<T, Kind>;

/** A string or symbol used to qualify/identify a named component or member. */
export type Qualifier = string | symbol;

/** A value that is either `T` or `Promise<T>`. */
export type Awaitable<T> = T | Promise<T>;

/** Any class constructor (concrete or abstract). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConstructor<T> = abstract new (...args: any[]) => T;

/**
 * Static metadata property carried by every Kavri decorator.
 * The `metadata` value is the data passed to the `create*Decorator` factory,
 * accessible without applying the decorator.
 */
export type DecoratorStatic<T> = { readonly metadata: T | undefined };

/**
 * A class decorator that works with both TC39 and legacy TypeScript decorator protocols.
 * Carries typed metadata `T` via the `metadata` static property.
 */
export type ClassDecorator<T> = globalThis.ClassDecorator &
  ((target: Function, context: ClassDecoratorContext) => void) &
  DecoratorStatic<T>;

/**
 * A method decorator that works with both TC39 and legacy TypeScript decorator protocols.
 * Carries typed metadata `T` via the `metadata` static property.
 */
export type MethodDecorator<T> = globalThis.MethodDecorator &
  ((target: Function, context: ClassMethodDecoratorContext) => void) &
  DecoratorStatic<T>;

/**
 * A field decorator that works with both TC39 and legacy TypeScript decorator protocols.
 * Uses `globalThis.MethodDecorator` as the legacy branch since legacy field decorators
 * receive the same `(target, key, descriptor?)` signature.
 * Carries typed metadata `T` via the `metadata` static property.
 */
export type FieldDecorator<T> = globalThis.MethodDecorator &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((value: any, context: ClassFieldDecoratorContext) => void) &
  DecoratorStatic<T>;

/** A factory function that creates a {@link ClassDecorator}. Also serves as the metadata key for `Metadata.of()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;

/** A factory function that creates a {@link MethodDecorator}. Also serves as the metadata key for `Metadata.of()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;

/** A factory function that creates a {@link FieldDecorator}. Also serves as the metadata key for `Metadata.of()`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>;

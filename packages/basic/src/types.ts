export type Qualifier = string | symbol;
export type Awaitable<T> = T | Promise<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConstructor<T> = abstract new (...args: any[]) => T;

export type DecoratorStatic<T> = { readonly metadata: T | undefined };

export type ClassDecorator<T> = globalThis.ClassDecorator &
  ((target: Function, context: ClassDecoratorContext) => void) &
  DecoratorStatic<T>;

export type MethodDecorator<T> = globalThis.MethodDecorator &
  ((target: Function, context: ClassMethodDecoratorContext) => void) &
  DecoratorStatic<T>;

// Legacy field decorators use the MethodDecorator signature (target, key, descriptor?)
export type FieldDecorator<T> = globalThis.MethodDecorator &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((value: any, context: ClassFieldDecoratorContext) => void) &
  DecoratorStatic<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>;

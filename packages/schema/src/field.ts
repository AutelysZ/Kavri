import { createFieldDecorator, Metadata } from '@kavri/basic';
import type { FieldDecoratorFactory, MethodDecoratorFactory, Qualifier } from '@kavri/basic';
import type {
  ValidateField,
  ValidateSchema,
  ValidateOptions,
  SchemaFieldDecorator,
  SchemaFieldDecoratorMetadata,
  SchemaFieldDecoratorFactory,
  SchemaFieldDecoratorFactoryStatic,
} from './types.js';

/**
 * Convert a {@link ValidateField} shorthand to a full {@link ValidateSchema}.
 *
 * If `input` is already a `ValidateSchema` (has a `value` property), returns it as-is.
 * Otherwise wraps the raw value: `{ value: input }`.
 *
 * @example
 * ```ts
 * toValidateSchema(3)          // { value: 3 }
 * toValidateSchema({ value: 3, message: 'too short' })  // as-is
 * ```
 */
export function toValidateSchema<T>(input: ValidateField<T>): ValidateSchema<T> {
  if (typeof input === 'object' && input !== null && 'value' in input) {
    return input as ValidateSchema<T>;
  }
  return { value: input as T };
}

/**
 * Create a schema field decorator factory with attached static methods.
 *
 * The factory function defines how the decorator is called (e.g., `MinLength(3)`).
 * The statics define how the schema pipeline processes it (validate, parse, serialize, toJsonSchema).
 *
 * @param factory - The decorator factory function body. May self-reference via its name.
 * @param statics - Static methods for the schema pipeline.
 * @returns The factory function with statics attached.
 *
 * @example
 * ```ts
 * const MinLength = createSchemaFieldDecoratorFactory(
 *   function MinLength(options: ValidateField<number>): SchemaFieldDecorator {
 *     return SchemaField(MinLength, toValidateSchema(options));
 *   },
 *   {
 *     message: '.label must be at least .value characters',
 *     validate: (params, value) => typeof value !== 'string' || value.length >= params.value,
 *     toJsonSchema: (params) => ({ minLength: params.value }),
 *   },
 * );
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSchemaFieldDecoratorFactory<P = any, F extends (...args: any[]) => any = any>(
  factory: F,
  statics: SchemaFieldDecoratorFactoryStatic<P>,
): F & SchemaFieldDecoratorFactoryStatic<P> {
  return Object.assign(factory, statics);
}

/**
 * Create a schema field decorator instance.
 *
 * @param factory - The factory that creates this decorator (serves as metadata key).
 * @param params - Parameters for this decorator instance.
 * @param children - Child constraint decorators, validated after this decorator passes
 *   (e.g., MinLength for IsString).
 * @param deps - Dependency decorators, validated before this decorator
 *   (e.g., IsString for IsEmail). If a dep fails, this decorator is skipped.
 */
export function SchemaField<P extends ValidateOptions>(
  factory: SchemaFieldDecoratorFactory<P>,
  params: P,
  children?: SchemaFieldDecorator[],
  deps?: SchemaFieldDecorator[],
): SchemaFieldDecorator<P> {
  const allChildren = [
    ...((params as { decorators?: SchemaFieldDecorator[] }).decorators ?? []),
    ...(children ?? []),
  ];
  const metadata: SchemaFieldDecoratorMetadata<P> = {
    rule: factory.rule,
    factory,
    params,
    deps: deps ?? [],
    children: allChildren,
  };
  // Use SchemaField itself as the factory key for ALL schema field decorators.
  // This means Metadata.of(SchemaField, cls, key) returns metadata for any schema
  // field regardless of which decorator factory created it.
  return createFieldDecorator(
    SchemaField as unknown as FieldDecoratorFactory<SchemaFieldDecoratorMetadata>,
    metadata as SchemaFieldDecoratorMetadata,
  ) as SchemaFieldDecorator<P>;
}

/**
 * Get all schema field entries for a class.
 * Returns `[fieldKey, metadata][]` for all fields decorated with schema decorators.
 */
export function getSchemaFields(
  target: object,
): readonly [Qualifier, SchemaFieldDecoratorMetadata][] {
  // Field decorators share the method metadata store. Cast to MethodDecoratorFactory
  // to satisfy the entries() overload.
  const entries = Metadata.entries(
    SchemaField as unknown as MethodDecoratorFactory<SchemaFieldDecoratorMetadata>,
  );
  const ctor = typeof target === 'function' ? target : target.constructor;
  return (entries as unknown as [Function, Qualifier, SchemaFieldDecoratorMetadata][])
    .filter(([cls]) => cls === ctor)
    .map(([, key, meta]) => [key, meta]);
}

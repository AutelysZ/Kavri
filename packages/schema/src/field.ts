import { createFieldDecorator } from '@kavri/basic';
import type { FieldDecoratorFactory } from '@kavri/basic';
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
export function createSchemaFieldDecoratorFactory<P extends ValidateOptions>(
  factory: FieldDecoratorFactory<SchemaFieldDecoratorMetadata<P>>,
  statics: SchemaFieldDecoratorFactoryStatic<P>,
): SchemaFieldDecoratorFactory<P> {
  return Object.assign(factory, statics) as SchemaFieldDecoratorFactory<P>;
}

/**
 * Create a schema field decorator instance.
 *
 * Stores `{ factory, params, decorators }` as the decorator's metadata via
 * `createFieldDecorator` from `@kavri/basic`. The `decorators` array holds
 * composed child decorators (e.g., `MinLength(3)` composed by `IsString({ minLength: 3 })`).
 *
 * @param factory - The factory that creates this decorator (serves as metadata key).
 * @param params - Parameters for this decorator instance.
 * @param decorators - Child decorators to compose.
 */
export function SchemaField<P extends ValidateOptions>(
  factory: SchemaFieldDecoratorFactory<P>,
  params: P,
  decorators?: SchemaFieldDecorator[],
): SchemaFieldDecorator<P> {
  const allDecorators = [
    ...((params as { decorators?: SchemaFieldDecorator[] }).decorators ?? []),
    ...(decorators ?? []),
  ];
  const metadata: SchemaFieldDecoratorMetadata<P> = {
    factory,
    params,
    decorators: allDecorators,
  };
  return createFieldDecorator(factory, metadata) as SchemaFieldDecorator<P>;
}

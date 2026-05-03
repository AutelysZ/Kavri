import type {
  AnyConstructor,
  Awaitable,
  FieldDecorator,
  FieldDecoratorFactory,
  Qualifier,
} from '@kavri/basic';
import { createFieldDecorator, Metadata } from '@kavri/basic';
import type { DecodeContext, DecodeResult } from './decode.js';
import { FieldSchemaDecoratorName } from './field.internal.js';
import { FromJsonSchemaRegistry } from './jsonschema.internal.js';
import { type FromJsonSchemaContext, type JsonSchema } from './jsonschema.js';
import { isArray, isFunction, isObject } from './utils.js';

export interface ValidateOptions {
  /**
   * The label for formatting error message, if not set, will use title.
   */
  label?: string;
  message?: string;
}

export function decoupleOptions<T extends ValidateOptions>({
  message,
  ...options
}: T): [ValidateOptions, Omit<T, 'message'>] {
  return [{ message, label: options.label }, options];
}

export type ValidateField<T> =
  | T
  | [T, ValidateOptions]
  | ([T] extends [boolean] ? ValidateOptions : never);

export function ofBoolField(
  input: ValidateField<boolean>,
): [value: boolean, options: ValidateOptions | undefined] {
  return isArray(input) ? input : isObject(input) ? [true, input] : [input, void 0];
}

export function ofArrayField<T extends readonly unknown[]>(
  input: ValidateField<T>,
): [T, ValidateOptions | undefined] {
  return isArray(input) && isArray(input[0])
    ? (input as [T, ValidateOptions])
    : [input as T, void 0];
}

export type ValueField<T> = [T] extends [boolean] | [readonly unknown[]] ? never : ValidateField<T>;

export function ofValueField<T>(
  input: ValueField<T>,
): [value: T, options: ValidateOptions | undefined] {
  return isArray(input) ? (input as [T, ValidateOptions]) : [input as T, void 0];
}

export type NestedFieldSchema =
  | FieldSchemaDecorator
  | readonly FieldSchemaDecorator[]
  | FieldSchemaDecoratorMetadata
  | readonly FieldSchemaDecoratorMetadata[];

export function ofNestedField(
  input: ValidateField<NestedFieldSchema>,
): readonly [NestedFieldSchema, ValidateOptions | undefined] {
  if (!isArray(input)) {
    return [input, void 0];
  }
  if (isArray(input[0]) || input.length < 2) {
    return input as [NestedFieldSchema, ValidateOptions];
  }
  if (isFieldSchemaDecoratorMetadata(input[1]) || isFieldSchemaDecorator(input[1])) {
    return [input as NestedFieldSchema, void 0];
  }
  return input as [NestedFieldSchema, ValidateOptions];
}

/**
 * Metadata stored by a schema field decorator.
 *
 * - `deps`: dependencies validated BEFORE this decorator (e.g., IsString for IsEmail).
 *   If a dep fails, this decorator's validation is skipped.
 * - `children`: constraints validated AFTER this decorator (e.g., MinLength for IsString).
 *   Only run if this decorator's own validation passes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FieldSchemaDecoratorMetadata<P = any> {
  /** The factory function that created this decorator. */
  factory: FieldSchemaDecoratorFactory<P>;
  /** Parameters passed to the factory. */
  params: P;
  options: ValidateOptions | undefined;
}

export function isFieldSchemaDecoratorMetadata(v: unknown): v is FieldSchemaDecoratorMetadata {
  return isObject(v) && 'factory' in v && isFieldSchemaDecoratorFactory(v.factory);
}

/** A field decorator carrying schema metadata. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldSchemaDecorator<P = any> = FieldDecorator<FieldSchemaDecoratorMetadata<P>>;

export enum Phase {
  /**
   * only provide json schema metadata plus label for print error message
   */
  Info,
  /**
   * provide default values
   */
  Defaults,
  /**
   * decode optional, if pass
   */
  Presence,
  /**
   * check type of the input, is string, is array, etc
   */
  Type,
  /**
   * coerce, like convert number to string, covert string to number
   */
  Coercion,
  /**
   * normalize the input, like trim a string
   */
  Normalization,
  /**
   * text encoding, like base64, base58
   */
  TextEncoding,
  /**
   * binary encoding, like gzip
   */
  BinaryEncoding,
  /**
   * the media type, like json, msgpack
   */
  ContentType,
  /**
   * the input matches filter, is email, is strong password etc
   */
  Semantics,
  /**
   * nested validation, for decorators that has nested decorators, eg:
   * IsArray's items
   * IsObject's properties
   */
  Property,
  /**
   * Composite validators, like AnyOf, OneOf
   */
  Composition,
  /**
   * For additional constraints, like unevaluatedProperties, additionalProperties
   */
  AdditionalConstraints,
}

/**
 * Static methods attached to a schema field decorator factory.
 * Used by the schema pipeline for validation, parsing, serialization, and JSON Schema generation.
 */
export interface FieldSchemaDecoratorFactoryStatic<P> {
  /**
   * The schema name, must be unique in the entire schema system.
   *
   * It's used for:
   *
   * 1. represent the rule name to display error message
   * 2. check if a factory is schema field decorator factory
   */
  [FieldSchemaDecoratorName]: string;

  phase: Phase;

  /**
   * The default error message, .xxx will be replaced with corresponding value, like .label, .value.
   *
   * .xxx include: the params of the decorator, include base {@link ValidateOptions}. And a few
   * special values:
   *
   * - .label   is options.label ?? options.title
   * - .key     is the current field name
   * - .value   is the current field's value
   * - .params  is the current params
   * - .input   is the current object
   *
   * Can be nested, like: .params.format, .input.otherField
   */
  message: string | ((ctx: DecodeContext<P>) => string);

  /**
   * Validate and parse the plain input to target data. eg: parse a string to bigint.
   */
  decode?: (
    ctx: DecodeContext<P>,
  ) => Awaitable<boolean | string | DecodeResult | readonly DecodeResult[]>;

  /**
   * convert the target data to plain input. eg: stringify as json, base64 json.
   *
   * We cannot support recursive json like what {@link decode} doing, because
   * the composite decorators are not able to choose the correct decorators variant
   * to handle. If we want to do it, we need another API like `match(value)` to
   * do it, which increases the complexity. For now, we only handle values
   * independently, and should only be used by {@link jsonReplacer}.
   */
  encode?: (params: P, value: unknown, key: string, obj: object) => unknown;

  /**
   * Convert the decorator to JSON schema.
   * This is required for all decorators.
   * You may use {@link toJsonSchema} to convert your nested rules.
   */
  toJsonSchema?: (params: P, current: JsonSchema) => JsonSchema | undefined;

  /**
   * Build decorators from external JSON schema.
   */
  fromJsonSchema?: (ctx: FromJsonSchemaContext) => FieldSchemaDecorator | undefined;
}

/**
 * A schema field decorator factory — both a callable factory and a carrier of
 * static methods for the schema pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldSchemaDecoratorFactory<P = any> = FieldDecoratorFactory<
  FieldSchemaDecoratorMetadata<P>
> &
  FieldSchemaDecoratorFactoryStatic<P>;

export function isFieldSchemaDecoratorFactory<P>(v: unknown): v is FieldSchemaDecoratorFactory<P> {
  return isFunction(v) && FieldSchemaDecoratorName in v;
}

export function isFieldSchemaDecorator<P>(v: unknown): v is FieldSchemaDecorator<P> {
  return isFunction(v) && 'metadata' in v && isFieldSchemaDecoratorMetadata(v.metadata);
}

export function FieldSchema<P>(
  factory: FieldSchemaDecoratorFactory<P>,
  params: P,
  options: ValidateOptions | undefined,
  extra?: FieldSchemaDecorator[],
): FieldSchemaDecorator<P> {
  // Use FieldSchema itself as the factory key for ALL schema field decorators.
  // This means Metadata.of(FieldSchema, cls, key) returns metadata for any schema
  // field regardless of which decorator factory created it.
  return createFieldDecorator(FieldSchema, { factory, params, options }, { self: extra });
}

/**
 * Create a schema field decorator factory with attached static methods.
 *
 * The factory function defines how the decorator is called (e.g., `MinLength(3)`).
 * The statics define how the schema pipeline processes it (decode, parse, json, toJsonSchema).
 *
 * @param name    - The decorator name
 * @param factory - The decorator factory function body. May self-reference via its name.
 * @param statics - Static methods for the schema pipeline.
 * @param methods - extra methods attach to the factory
 * @returns The factory function with statics attached.
 *
 * @example
 * ```ts
 * const MinLength = createFieldSchemaDecoratorFactory(
 *   function MinLength(options: ValidateField<number>): FieldSchemaDecorator {
 *     return FieldSchema(MinLength, toValidateSchema(options));
 *   },
 *   {
 *     message: '.label must be at least .value characters',
 *     decode: (params, value) => typeof value !== 'string' || value.length >= params.value,
 *     toJsonSchema: (params) => ({ minLength: params.value }),
 *   },
 * );
 * ```
 */
/* #__NO_SIDE_EFFECTS__ */
export function createFieldSchemaDecoratorFactory<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  F extends (...args: any[]) => FieldSchemaDecorator,
  U,
>(
  name: string,
  factory: F,
  statics: Omit<
    FieldSchemaDecoratorFactoryStatic<ReturnType<F>['metadata']['params']>,
    typeof FieldSchemaDecoratorName
  >,
  methods?: U,
): F & FieldSchemaDecoratorFactoryStatic<ReturnType<F>['metadata']['params']> & U {
  if (statics.fromJsonSchema) {
    FromJsonSchemaRegistry.add(factory as never);
  }
  return Object.assign(factory, statics, { [FieldSchemaDecoratorName]: name }, methods);
}

export const Dummy = createFieldSchemaDecoratorFactory(
  'Dummy',
  (): FieldSchemaDecorator<undefined> => {
    return FieldSchema(Dummy, void 0, void 0);
  },
  {
    phase: Phase.Info,
    message: '',
  },
);

/**
 * Get all schema field entries for a class or an instance.
 */
export function getFieldSchema<R extends object>(
  target: AnyConstructor<R> | R,
): ReadonlyMap<Qualifier, readonly FieldSchemaDecoratorMetadata[]> | undefined {
  return Metadata.ofField(FieldSchema, target);
}

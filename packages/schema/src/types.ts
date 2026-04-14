import type { FieldDecorator, FieldDecoratorFactory } from '@kavri/basic';
import type { SchemaValidationError } from './schema';
import type { JsonSchema } from './jsonschema.js';

export type { JsonSchema } from './jsonschema.js';
export type StringKeyOf<T> = keyof T & string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartialRecord<K extends keyof any, V> = { [P in K]?: V };

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

/** Options for custom validation messages. */
export interface ValidateOptions {
  title?: string;
  /**
   * The label for formatting error message, if not set, will use title.
   */
  label?: string;
  message?: string;
}

/** A validation constraint with a value and optional message overrides. */
export interface ValidateSchema<T> extends ValidateOptions {
  value: T;
}

/** Shorthand: pass a raw value or a full {@link ValidateSchema}. */
export type ValidateField<T> = T | ValidateSchema<T>;

// ---------------------------------------------------------------------------
// Base schema
// ---------------------------------------------------------------------------

/**
 * Base options shared by all field schema decorators.
 *
 * @typeParam S - The JSON Schema type (e.g., 'string', 'integer').
 * @typeParam V - The TypeScript value type (e.g., `string`, `number`).
 */
export interface BaseSchema<S = unknown, V = S> extends ValidateOptions {
  type?: string;
  description?: string;
  default?: V;
  examples?: V[];
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  optional?: boolean;
  nullable?: boolean;
  const?: ValidateField<V>;
  enum?: ValidateField<V[]>;
}

export type NestedFieldSchema = SchemaFieldDecorator | readonly SchemaFieldDecorator[];

// ---------------------------------------------------------------------------
// Concrete schema types
// ---------------------------------------------------------------------------

/** Schema options for string fields. */
export interface StringSchema<V = string> extends BaseSchema<string, V> {
  maxLength?: ValidateField<number>;
  minLength?: ValidateField<number>;
  pattern?: ValidateField<string>;
  format?: string;
  contentEncoding?: string;
  contentMediaType?: string;
  // how to implement? shorthand for AnyOf empty string and other rules?
  allowEmpty?: ValidateField<boolean>;
  contentSchema?: NestedFieldSchema;
}

/** Schema options for numeric fields (integer, number, bigint). */
export interface NumericSchema<V = number> extends BaseSchema<number, V> {
  maximum?: ValidateField<V>;
  minimum?: ValidateField<V>;
  exclusiveMaximum?: ValidateField<V>;
  exclusiveMinimum?: ValidateField<V>;
  multipleOf?: ValidateField<V>;
}

/** Schema options for object fields. */
export interface ObjectSchema<T extends object = object> extends BaseSchema<T> {
  properties?: PartialRecord<StringKeyOf<T>, NestedFieldSchema>;
  patternProperties?: Record<string, NestedFieldSchema>;
  additionalProperties?: NestedFieldSchema | false;
  unevaluatedProperties?: NestedFieldSchema | false;
  propertyNames?: NestedFieldSchema;
  maxProperties?: ValidateField<number>;
  minProperties?: ValidateField<number>;
  required?: ValidateField<StringKeyOf<T>[]>;
  dependentRequired?: PartialRecord<StringKeyOf<T>, StringKeyOf<T>[]>;
  dependentSchemas?: PartialRecord<StringKeyOf<T>, NestedFieldSchema>;
}

/** Schema options for array fields. */
export interface ArraySchema<T = unknown> extends BaseSchema<T[]> {
  items?: NestedFieldSchema;
  prefixItems?: NestedFieldSchema[];
  contains?: NestedFieldSchema;
  minContains?: ValidateField<number>;
  maxContains?: ValidateField<number>;
  minItems?: ValidateField<number>;
  maxItems?: ValidateField<number>;
  uniqueItems?: ValidateField<boolean>;
  unevaluatedItems?: NestedFieldSchema | false;
}

/** Schema options for anyOf (union) fields. */
export interface AnyOfSchema<T = unknown> extends BaseSchema<T> {
  anyOf: NestedFieldSchema[];
}

/** Schema options for oneOf (exactly one match) fields. */
export interface OneOfSchema<T = unknown> extends BaseSchema<T> {
  oneOf: NestedFieldSchema[];
}

/** Schema options for allOf (intersection) fields. */
export interface AllOfSchema<T = unknown> extends BaseSchema<T> {
  allOf: NestedFieldSchema[];
}

// ---------------------------------------------------------------------------
// Schema field decorator types
// ---------------------------------------------------------------------------

/**
 * Metadata stored by a schema field decorator.
 *
 * - `deps`: dependencies validated BEFORE this decorator (e.g., IsString for IsEmail).
 *   If a dep fails, this decorator's validation is skipped.
 * - `children`: constraints validated AFTER this decorator (e.g., MinLength for IsString).
 *   Only run if this decorator's own validation passes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SchemaFieldDecoratorMetadata<P = any> {
  /** Decorator rule name for validation error messages. */
  rule: string;
  /** The factory function that created this decorator. */
  factory: SchemaFieldDecoratorFactory<P>;
  /** Parameters passed to the factory. */
  params: P;
  /** Dependencies: validated before this decorator. If any fails, this is skipped. */
  deps: SchemaFieldDecorator[];
  /** Children: constraints validated after this decorator passes. */
  children: SchemaFieldDecorator[];
}

/** A field decorator carrying schema metadata. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaFieldDecorator<P = any> = FieldDecorator<SchemaFieldDecoratorMetadata<P>>;

export const schemaFieldDecoratorName = Symbol('schema:name');

/**
 * Static methods attached to a schema field decorator factory.
 * Used by the schema pipeline for validation, parsing, serialization, and JSON Schema generation.
 */
export interface SchemaFieldDecoratorFactoryStatic<P> {
  /**
   * The schema name, must be unique in the entire schema system.
   *
   * It's used for:
   *
   * 1. represent the rule name to display error message
   * 2. check if a factory is schema field decorator factory
   */
  [schemaFieldDecoratorName]: string;

  /**
   * The default error message, .xxx will be replaced with corresponding value, like .label, .value.
   *
   * .xxx include: the params of the decorator, include base {@link ValidateOptions}. And a few
   * special values:
   *
   * - .label is options.label ?? options.title
   * - .key is the current field name
   * - .data is the current field's value, note it's not .value. .value is used by
   *    {@link ValidateSchema}, which is used by primitive param decorators.
   * - .this is the current input object, can use like .this.foo to get a field.
   */
  message: string | ((params: P) => string);

  /**
   * parse the plain data to target object. eg: parse a string to bigint
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse?: (params: P, plain: any) => any;
  /**
   * convert the target object to string, eg: convert bigint to string
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialize?: (params: P, value: any) => any;
  /**
   * validate if the plain data is valid., eg: for bigint, it's the string to validate.
   *
   * You may use {@link validateJsonSchema} to validate your nested rules.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate?: (params: P, plain: any, obj: any) => boolean | [boolean, SchemaValidationError];

  /**
   * Convert the decorator to JSON schema.
   * This is required for all decorators.
   * You may use {@link toJsonSchema} to convert your nested rules.
   */
  toJsonSchema?: (params: P) => JsonSchema | undefined;

  /**
   * build from JSON schema.
   * You may use {@link fromJsonSchema} to convert your nested rules.
   */
  fromJsonSchema?: (params: P, schema: JsonSchema) => SchemaFieldDecorator | undefined;
}

/**
 * A schema field decorator factory — both a callable factory and a carrier of
 * static methods for the schema pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaFieldDecoratorFactory<P = any> = FieldDecoratorFactory<
  SchemaFieldDecoratorMetadata<P>
> &
  SchemaFieldDecoratorFactoryStatic<P>;

/**
 * Resolves to the appropriate schema type based on the value type.
 * - `string` → {@link StringSchema}
 * - `number` | `bigint` → {@link NumericSchema}
 * - `object` → {@link ObjectSchema}
 */
export type InferredSchema<V> = V extends string
  ? StringSchema<V>
  : V extends number | bigint
    ? NumericSchema<V>
    : V extends object
      ? ObjectSchema<V>
      : BaseSchema<unknown, V>;

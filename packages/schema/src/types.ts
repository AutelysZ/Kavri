import type { FieldDecorator, FieldDecoratorFactory } from '@kavri/basic';

// ---------------------------------------------------------------------------
// JSON Schema types
// ---------------------------------------------------------------------------

/** JSON Schema 2020-12 keywords (subset used by field decorators). */
export interface JsonSchema {
  title?: string;
  description?: string;
  type?: string | string[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  pattern?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  contains?: JsonSchema;
  minContains?: number;
  maxContains?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  unevaluatedItems?: JsonSchema | boolean;
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  unevaluatedProperties?: JsonSchema | boolean;
  propertyNames?: JsonSchema;
  minProperties?: number;
  maxProperties?: number;
  required?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JsonSchema>;
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: JsonSchema;
  $id?: string;
  $schema?: string;
  $anchor?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
}

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

/** Options for custom validation messages. */
export interface ValidateOptions {
  title?: string;
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
  /** Additional inline decorators to compose. */
  decorators?: SchemaFieldDecorator[];
}

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
  contentSchema?: SchemaFieldDecorator;
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
export interface ObjectSchema<T = object> extends BaseSchema<T> {
  properties?: { [K in keyof T]?: SchemaFieldDecorator };
  patternProperties?: Record<string, SchemaFieldDecorator>;
  additionalProperties?: SchemaFieldDecorator | false;
  unevaluatedProperties?: SchemaFieldDecorator | false;
  propertyNames?: SchemaFieldDecorator;
  maxProperties?: ValidateField<number>;
  minProperties?: ValidateField<number>;
  required?: ValidateField<(keyof T & string)[]>;
  dependentRequired?: Partial<Record<keyof T & string, (keyof T & string)[]>>;
  dependentSchemas?: Partial<Record<keyof T & string, SchemaFieldDecorator>>;
}

/** Schema options for array fields. */
export interface ArraySchema<T = unknown> extends BaseSchema<T[]> {
  items?: SchemaFieldDecorator;
  prefixItems?: SchemaFieldDecorator[];
  contains?: SchemaFieldDecorator;
  minContains?: ValidateField<number>;
  maxContains?: ValidateField<number>;
  minItems?: ValidateField<number>;
  maxItems?: ValidateField<number>;
  uniqueItems?: ValidateField<boolean>;
  unevaluatedItems?: SchemaFieldDecorator | false;
}

/** Schema options for anyOf (union) fields. */
export interface AnyOfSchema<T = unknown> extends BaseSchema<T> {
  anyOf: SchemaFieldDecorator[];
}

/** Schema options for oneOf (exactly one match) fields. */
export interface OneOfSchema<T = unknown> extends BaseSchema<T> {
  oneOf: SchemaFieldDecorator[];
}

/** Schema options for allOf (intersection) fields. */
export interface AllOfSchema<T = unknown> extends BaseSchema<T> {
  allOf: SchemaFieldDecorator[];
}

// ---------------------------------------------------------------------------
// Schema field decorator types
// ---------------------------------------------------------------------------

/**
 * Metadata stored by a schema field decorator.
 * Contains the factory reference, params, and composed child decorators.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SchemaFieldDecoratorMetadata<P = any> {
  /** The factory function that created this decorator. */
  factory: SchemaFieldDecoratorFactory<P>;
  /** Parameters passed to the factory. */
  params: P;
  /** Composed child decorators (e.g., MinLength from IsString's minLength option). */
  decorators: SchemaFieldDecorator[];
}

/** A field decorator carrying schema metadata. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaFieldDecorator<P = any> = FieldDecorator<SchemaFieldDecoratorMetadata<P>>;

/**
 * Static methods attached to a schema field decorator factory.
 * Used by the schema pipeline for validation, parsing, serialization, and JSON Schema generation.
 */
export interface SchemaFieldDecoratorFactoryStatic<P> {
  /** Default validation error message template. */
  message?: string;
  /** Parse raw input into the target type. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse?: (params: P, plain: any) => any;
  /** Serialize a value back to a plain representation. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialize?: (params: P, value: any) => any;
  /** Validate a value against the constraint. Return true if valid. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate?: (params: P, value: any) => boolean;
  /** Generate JSON Schema keywords for this constraint. */
  toJsonSchema?: (params: P) => JsonSchema;
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

/**
 * Primitive constraint decorators.
 * These are used internally by type decorators (e.g., IsString composes MinLength)
 * and can also be applied directly.
 */
import type { ValidateField, ValidateSchema, SchemaFieldDecorator } from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField, toValidateSchema } from '../field.js';

// ---------------------------------------------------------------------------
// String constraints
// ---------------------------------------------------------------------------

/** Minimum string length. */
export const MinLength = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MinLength, toValidateSchema(options));
  },
  {
    message: '.label must be at least .value characters',
    validate: (p, v) => typeof v !== 'string' || v.length >= p.value,
    toJsonSchema: (p) => ({ minLength: p.value }),
  },
);

/** Maximum string length. */
export const MaxLength = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MaxLength, toValidateSchema(options));
  },
  {
    message: '.label must be at most .value characters',
    validate: (p, v) => typeof v !== 'string' || v.length <= p.value,
    toJsonSchema: (p) => ({ maxLength: p.value }),
  },
);

/** String must match a regular expression pattern. */
export const Pattern = createSchemaFieldDecoratorFactory(
  (options: ValidateField<string>): SchemaFieldDecorator<ValidateSchema<string>> => {
    return SchemaField(Pattern, toValidateSchema(options));
  },
  {
    message: '.label must match pattern .value',
    validate: (p, v) => typeof v !== 'string' || new RegExp(p.value).test(v),
    toJsonSchema: (p) => ({ pattern: p.value }),
  },
);

// ---------------------------------------------------------------------------
// Numeric constraints
// ---------------------------------------------------------------------------

/** Minimum value (inclusive). */
export const Min = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(Min, toValidateSchema(options));
  },
  {
    message: '.label must be at least .value',
    validate: (p, v) => typeof v !== 'number' || v >= p.value,
    toJsonSchema: (p) => ({ minimum: p.value }),
  },
);

/** Maximum value (inclusive). */
export const Max = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(Max, toValidateSchema(options));
  },
  {
    message: '.label must be at most .value',
    validate: (p, v) => typeof v !== 'number' || v <= p.value,
    toJsonSchema: (p) => ({ maximum: p.value }),
  },
);

/** Exclusive minimum value. */
export const ExclusiveMin = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(ExclusiveMin, toValidateSchema(options));
  },
  {
    message: '.label must be greater than .value',
    validate: (p, v) => typeof v !== 'number' || v > p.value,
    toJsonSchema: (p) => ({ exclusiveMinimum: p.value }),
  },
);

/** Exclusive maximum value. */
export const ExclusiveMax = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(ExclusiveMax, toValidateSchema(options));
  },
  {
    message: '.label must be less than .value',
    validate: (p, v) => typeof v !== 'number' || v < p.value,
    toJsonSchema: (p) => ({ exclusiveMaximum: p.value }),
  },
);

/** Value must be a multiple of the given number. */
export const MultipleOf = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MultipleOf, toValidateSchema(options));
  },
  {
    message: '.label must be a multiple of .value',
    validate: (p, v) => typeof v !== 'number' || v % p.value === 0,
    toJsonSchema: (p) => ({ multipleOf: p.value }),
  },
);

// ---------------------------------------------------------------------------
// Array constraints
// ---------------------------------------------------------------------------

/** Minimum array length. */
export const MinItems = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MinItems, toValidateSchema(options));
  },
  {
    message: '.label must have at least .value items',
    validate: (p, v) => !Array.isArray(v) || v.length >= p.value,
    toJsonSchema: (p) => ({ minItems: p.value }),
  },
);

/** Maximum array length. */
export const MaxItems = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MaxItems, toValidateSchema(options));
  },
  {
    message: '.label must have at most .value items',
    validate: (p, v) => !Array.isArray(v) || v.length <= p.value,
    toJsonSchema: (p) => ({ maxItems: p.value }),
  },
);

/** Array items must be unique. */
export const UniqueItems = createSchemaFieldDecoratorFactory(
  (options?: ValidateField<boolean>): SchemaFieldDecorator<ValidateSchema<boolean>> => {
    return SchemaField(UniqueItems, toValidateSchema(options ?? true));
  },
  {
    message: '.label must have unique items',
    validate: (p, v) => !p.value || !Array.isArray(v) || new Set(v).size === v.length,
    toJsonSchema: (p) => ({ uniqueItems: p.value }),
  },
);

// ---------------------------------------------------------------------------
// Object constraints
// ---------------------------------------------------------------------------

/** Minimum number of properties. */
export const MinProperties = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MinProperties, toValidateSchema(options));
  },
  {
    message: '.label must have at least .value properties',
    validate: (p, v) =>
      typeof v !== 'object' || v === null || Object.keys(v as object).length >= p.value,
    toJsonSchema: (p) => ({ minProperties: p.value }),
  },
);

/** Maximum number of properties. */
export const MaxProperties = createSchemaFieldDecoratorFactory(
  (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> => {
    return SchemaField(MaxProperties, toValidateSchema(options));
  },
  {
    message: '.label must have at most .value properties',
    validate: (p, v) =>
      typeof v !== 'object' || v === null || Object.keys(v as object).length <= p.value,
    toJsonSchema: (p) => ({ maxProperties: p.value }),
  },
);

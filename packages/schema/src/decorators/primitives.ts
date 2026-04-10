/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Primitive type decorators: IsString, IsInteger, IsNumber, IsBigInt, IsBoolean, IsDate.
 * Each composes relevant constraint decorators from schema options.
 */
import type {
  StringSchema,
  NumericSchema,
  BaseSchema,
  ValidateOptions,
  SchemaFieldDecorator,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField, toValidateSchema } from '../field.js';
import {
  MinLength,
  MaxLength,
  Pattern,
  Min,
  Max,
  ExclusiveMin,
  ExclusiveMax,
  MultipleOf,
} from './constraints.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build child constraint decorators from StringSchema options. */
function stringConstraints(schema?: StringSchema): SchemaFieldDecorator[] {
  const children: SchemaFieldDecorator[] = [];
  if (schema?.minLength !== undefined) children.push(MinLength(toValidateSchema(schema.minLength)));
  if (schema?.maxLength !== undefined) children.push(MaxLength(toValidateSchema(schema.maxLength)));
  if (schema?.pattern !== undefined) children.push(Pattern(toValidateSchema(schema.pattern)));
  return children;
}

/** Build child constraint decorators from NumericSchema options. */
function numericConstraints<V extends number | bigint>(
  schema?: NumericSchema<V>,
): SchemaFieldDecorator[] {
  const children: SchemaFieldDecorator[] = [];
  if (schema?.minimum !== undefined) {
    const s = toValidateSchema(schema.minimum);
    children.push(Min({ value: Number(s.value), title: s.title, message: s.message }));
  }
  if (schema?.maximum !== undefined) {
    const s = toValidateSchema(schema.maximum);
    children.push(Max({ value: Number(s.value), title: s.title, message: s.message }));
  }
  if (schema?.exclusiveMinimum !== undefined) {
    const s = toValidateSchema(schema.exclusiveMinimum);
    children.push(ExclusiveMin({ value: Number(s.value), title: s.title, message: s.message }));
  }
  if (schema?.exclusiveMaximum !== undefined) {
    const s = toValidateSchema(schema.exclusiveMaximum);
    children.push(ExclusiveMax({ value: Number(s.value), title: s.title, message: s.message }));
  }
  if (schema?.multipleOf !== undefined) {
    const s = toValidateSchema(schema.multipleOf);
    children.push(MultipleOf({ value: Number(s.value), title: s.title, message: s.message }));
  }
  return children;
}

// ---------------------------------------------------------------------------
// IsString
// ---------------------------------------------------------------------------

/** String field. Composes MinLength, MaxLength, Pattern from schema options. */
export const IsString = createSchemaFieldDecoratorFactory(
  function IsString<V = string>(schema?: StringSchema<V>): SchemaFieldDecorator<StringSchema<V>> {
    return SchemaField(
      IsString,
      (schema ?? {}) as StringSchema<V>,
      stringConstraints(schema as StringSchema),
    ) as any;
  },
  {
    validate: (_, v) => typeof v === 'string',
    toJsonSchema: (p) => ({
      type: 'string',
      ...(p.format ? { format: p.format } : {}),
      ...(p.contentEncoding ? { contentEncoding: p.contentEncoding } : {}),
      ...(p.contentMediaType ? { contentMediaType: p.contentMediaType } : {}),
    }),
  },
);

// ---------------------------------------------------------------------------
// IsInteger / IsNumber
// ---------------------------------------------------------------------------

/** Integer field. Composes Min, Max, ExclusiveMin, ExclusiveMax, MultipleOf. */
export const IsInteger = createSchemaFieldDecoratorFactory(
  function IsInteger(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema> {
    return SchemaField(IsInteger, (schema ?? {}) as NumericSchema, numericConstraints(schema));
  },
  {
    validate: (_, v) => typeof v === 'number' && Number.isInteger(v),
    toJsonSchema: () => ({ type: 'integer' }),
  },
);

/** Number (float) field. Composes Min, Max, ExclusiveMin, ExclusiveMax, MultipleOf. */
export const IsNumber = createSchemaFieldDecoratorFactory(
  function IsNumber(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema> {
    return SchemaField(IsNumber, (schema ?? {}) as NumericSchema, numericConstraints(schema));
  },
  {
    validate: (_, v) => typeof v === 'number' && Number.isFinite(v),
    toJsonSchema: () => ({ type: 'number' }),
  },
);

// ---------------------------------------------------------------------------
// IsBigInt
// ---------------------------------------------------------------------------

/**
 * BigInt field. JSON Schema: `{ type: 'string', pattern: '^-?\\d+$' }`.
 * Parsed from string, serialized to string.
 */
export const IsBigInt = createSchemaFieldDecoratorFactory(
  function IsBigInt(schema?: NumericSchema<bigint>): SchemaFieldDecorator<NumericSchema<bigint>> {
    return SchemaField(
      IsBigInt,
      (schema ?? {}) as NumericSchema<bigint>,
      numericConstraints(schema),
    );
  },
  {
    validate: (_, v) => typeof v === 'bigint' || (typeof v === 'string' && /^-?\d+$/.test(v)),
    parse: (_, v) => (typeof v === 'string' ? BigInt(v) : v),
    serialize: (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    toJsonSchema: () => ({ type: 'string', pattern: '^-?\\d+$' }),
  },
);

// ---------------------------------------------------------------------------
// IsBoolean
// ---------------------------------------------------------------------------

/** Boolean field. */
export const IsBoolean = createSchemaFieldDecoratorFactory(
  function IsBoolean(schema?: BaseSchema<boolean>): SchemaFieldDecorator<BaseSchema<boolean>> {
    return SchemaField(IsBoolean, (schema ?? {}) as BaseSchema<boolean>);
  },
  {
    validate: (_, v) => typeof v === 'boolean',
    toJsonSchema: () => ({ type: 'boolean' }),
  },
);

// ---------------------------------------------------------------------------
// IsDate
// ---------------------------------------------------------------------------

/** Options for date validation. */
export interface DateOptions extends ValidateOptions {
  /** Date format: 'iso' (date-time) or 'date' (date only). Default: 'iso'. */
  format?: 'iso' | 'date';
  /** Value must be before this date. */
  before?: Date;
  /** Value must be after this date. */
  after?: Date;
}

/**
 * Date field. Composes IsString internally.
 * Parse: `new Date(value)`. Serialize: `.toISOString()` or date portion.
 * JSON Schema: `{ type: 'string', format: 'date-time' | 'date' }`.
 */
export const IsDate = createSchemaFieldDecoratorFactory(
  function IsDate(
    options?: DateOptions,
    schema?: StringSchema<Date>,
  ): SchemaFieldDecorator<DateOptions> {
    return SchemaField(IsDate, (options ?? {}) as DateOptions, [IsString(schema)]);
  },
  {
    validate: (p, v) => {
      if (typeof v === 'string') {
        const d = new Date(v);
        if (isNaN(d.getTime())) return false;
        if (p.before && d >= p.before) return false;
        if (p.after && d <= p.after) return false;
        return true;
      }
      if (v instanceof Date) {
        if (p.before && v >= p.before) return false;
        if (p.after && v <= p.after) return false;
        return true;
      }
      return false;
    },
    parse: (_, v) => (typeof v === 'string' ? new Date(v) : v),
    serialize: (p, v) =>
      v instanceof Date
        ? p.format === 'date'
          ? v.toISOString().slice(0, 10)
          : v.toISOString()
        : v,
    toJsonSchema: (p) => ({
      type: 'string',
      format: p.format === 'date' ? 'date' : 'date-time',
    }),
  },
);

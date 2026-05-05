import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { addType, isBigInt, isInteger, isNumber, isString } from '../utils.js';
import { decoupleTypeOptions, Info, type TypeOptions } from './base.js';
import { IsInstanceOf } from './object.js';
import { IsString } from './string.js';

export type NumericType = number | bigint;

export interface NumericSchema<V extends NumericType = NumericType> extends TypeOptions<V> {
  maximum?: ValidateField<V>;
  minimum?: ValidateField<V>;
  exclusiveMaximum?: ValidateField<V>;
  exclusiveMinimum?: ValidateField<V>;
  multipleOf?: ValidateField<V>;
}

/**
 * Inclusive lower bound. Works for `number` and `bigint`.
 */
export const Minimum = createFieldSchemaDecoratorFactory(
  'Minimum',
  (value: NumericType, options: ValidateOptions = {}): FieldSchemaDecorator<NumericType> => {
    return FieldSchema<NumericType>(Minimum, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must >= .value',
    decode: ({ value, params }) => {
      if (isBigInt(value)) return value >= BigInt(params);
      if (isNumber(value)) return !isBigInt(params) && value >= params;
      return true;
    },
    toJsonSchema: (p) => (isNumber(p) ? { minimum: p } : void 0),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.minimum) ? Minimum(schema.minimum) : void 0;
    },
  },
);

/**
 * Inclusive upper bound. Works for `number` and `bigint`.
 */
export const Maximum = createFieldSchemaDecoratorFactory(
  'Maximum',
  (value: NumericType, options: ValidateOptions = {}): FieldSchemaDecorator<NumericType> => {
    return FieldSchema<NumericType>(Maximum, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must <= .value',
    decode: ({ value, params }) => {
      if (isBigInt(value)) return value <= BigInt(params);
      if (isNumber(value)) return !isBigInt(params) && value <= params;
      return true;
    },
    toJsonSchema: (p) => (isNumber(p) ? { maximum: p } : void 0),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.maximum) ? Maximum(schema.maximum) : void 0;
    },
  },
);

/**
 * Exclusive lower bound.
 */
export const ExclusiveMinimum = createFieldSchemaDecoratorFactory(
  'ExclusiveMin',
  (value: NumericType, options: ValidateOptions = {}): FieldSchemaDecorator<NumericType> => {
    return FieldSchema<NumericType>(ExclusiveMinimum, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be greater than .value',
    decode: ({ value, params }) => {
      if (isBigInt(value)) return value > BigInt(params);
      if (isNumber(value)) return !isBigInt(params) && value > params;
      return true;
    },
    toJsonSchema: (p) => (isNumber(p) ? { exclusiveMinimum: p } : void 0),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.exclusiveMinimum) ? ExclusiveMinimum(schema.exclusiveMinimum) : void 0;
    },
  },
);

/**
 * Exclusive upper bound.
 */
export const ExclusiveMaximum = createFieldSchemaDecoratorFactory(
  'ExclusiveMax',
  (value: NumericType, options: ValidateOptions = {}): FieldSchemaDecorator<NumericType> => {
    return FieldSchema<NumericType>(ExclusiveMaximum, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be less than .value',
    decode: ({ value, params }) => {
      if (isBigInt(value)) return value < BigInt(params);
      if (isNumber(value)) return !isBigInt(params) && value < params;
      return true;
    },
    toJsonSchema: (p) => (isNumber(p) ? { exclusiveMaximum: p } : void 0),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.exclusiveMaximum) ? ExclusiveMaximum(schema.exclusiveMaximum) : void 0;
    },
  },
);

/**
 * Value must be an integer multiple of `params`.
 */
export const MultipleOf = createFieldSchemaDecoratorFactory(
  'MultipleOf',
  (value: NumericType, options: ValidateOptions = {}): FieldSchemaDecorator<NumericType> => {
    return FieldSchema<NumericType>(MultipleOf, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be a multiple of .value',
    decode: ({ value, params }) => {
      if (isBigInt(value)) return value % BigInt(params) === 0n;
      if (isNumber(value)) return !isBigInt(params) && value % params === 0;
      return true;
    },
    toJsonSchema: (p) => (isNumber(p) ? { multipleOf: p } : void 0),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.multipleOf) ? MultipleOf(schema.multipleOf) : void 0;
    },
  },
);

/**
 * Build the constraint deps for a numeric type decorator from its options.
 */
function numericConstraints({
  minimum,
  maximum,
  exclusiveMinimum,
  exclusiveMaximum,
  multipleOf,
  ...options
}: NumericSchema): { opts: ValidateOptions; deps: FieldSchemaDecorator[] } {
  const [opts, info] = decoupleTypeOptions(options);
  const deps: FieldSchemaDecorator[] = [Info(info)];
  if (minimum !== undefined) deps.push(Minimum(...ofValueField(minimum)));
  if (maximum !== undefined) deps.push(Maximum(...ofValueField(maximum)));
  if (exclusiveMinimum !== undefined)
    deps.push(ExclusiveMinimum(...ofValueField(exclusiveMinimum)));
  if (exclusiveMaximum !== undefined)
    deps.push(ExclusiveMaximum(...ofValueField(exclusiveMaximum)));
  if (multipleOf !== undefined) deps.push(MultipleOf(...ofValueField(multipleOf)));
  return { opts, deps };
}

/**
 * Integer field. Composes `Info` plus `Minimum`/`Maximum`/`ExclusiveMin`/
 * `ExclusiveMax`/`MultipleOf` from `NumericSchema`. When `schema.type` is
 * `false`, `Dummy` is used in place of the type assertion (useful inside
 * `AllOf` compositions).
 */
export const IsInteger = createFieldSchemaDecoratorFactory(
  'IsInteger',
  (schema: NumericSchema = {}): FieldSchemaDecorator<undefined> => {
    const { opts, deps } = numericConstraints(schema);
    return FieldSchema<undefined>(schema.type === false ? Dummy : IsInteger, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: '.label must be an integer',
    decode: ({ value }) => isInteger(value),
    toJsonSchema: addType('integer'),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined => {
      return hasType('integer') ? IsInteger() : void 0;
    },
  },
);

/**
 * Number (float) field. Composes `Info` plus `Minimum`/`Maximum`/
 * `ExclusiveMin`/`ExclusiveMax`/`MultipleOf` from `NumericSchema`. When
 * `schema.type` is `false`, `Dummy` is used in place of the type assertion.
 */
export const IsNumber = createFieldSchemaDecoratorFactory(
  'IsNumber',
  (schema: NumericSchema<number> = {}): FieldSchemaDecorator<undefined> => {
    const { opts, deps } = numericConstraints(schema);
    return FieldSchema<undefined>(schema.type === false ? Dummy : IsNumber, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: '.label must be a number',
    decode: ({ value }) => isNumber(value),
    toJsonSchema: addType('number'),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined => {
      return hasType('number') ? IsNumber() : void 0;
    },
  },
);

/**
 * Bigint field. Coerces string and number inputs to `bigint` via `BigInt(...)`,
 * encodes back to string for serialization. JSON Schema is emitted as
 * `string | number` with `integer` format.
 */
export const ToBigInt = createFieldSchemaDecoratorFactory(
  'IsBigInt',
  (schema: NumericSchema = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<undefined>(ToBigInt, void 0, opts, [
      IsInteger(info),
      IsString({ pattern: '^\\s*(?:[+-]?\\d+|0[bB][01]+|0[oO][0-7]+|0[xX][0-9a-fA-F]+)\\s*$' }),
      IsInstanceOf('bigint'),
    ]);
  },
  {
    phase: Phase.Type,
    message: '.label must be a bigint',
    decode: ({ value, provide }) => {
      if (isBigInt(value)) return true;
      if (isString(value)) return provide(BigInt(value));
      if (isNumber(value)) return provide(BigInt(value));
      return false;
    },
    encode: (_, value) => {
      return isBigInt(value) ? value.toString() : value;
    },
    fromJsonSchema: ({ schema, hasType }): FieldSchemaDecorator | undefined => {
      return schema.format === 'bigint' || (schema.format === 'integer' && hasType('string'))
        ? ToBigInt()
        : void 0;
    },
  },
);

/**
 * Coerce string to number (float). Adds `IsNumber(schema)` as a dep so the
 * coerced value is validated against `NumericSchema` constraints. Strings that
 * are not finite numbers (e.g. `'1abc'`) pass through unchanged so the
 * `IsNumber` dep rejects them.
 */
export const ToNumber = createFieldSchemaDecoratorFactory(
  'ToNumber',
  (schema: NumericSchema<number> = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<undefined>(ToNumber, void 0, opts, [IsNumber(info), IsString()]);
  },
  {
    phase: Phase.Coercion,
    message: '.label is invalid',
    decode: ({ value, provide }) => {
      if (!isString(value)) return true;
      const n = Number(value);
      return isNumber(n) ? provide(n) : false;
    },
  },
);

/**
 * Coerce string to integer. Adds `IsInteger(schema)` as a dep. Strings that do
 * not parse to an exact integer (e.g. `'1abc'`, `'1.5'`) pass through
 * unchanged so `IsInteger` rejects them.
 */
export const ToInteger = createFieldSchemaDecoratorFactory(
  'ToInteger',
  (schema: NumericSchema<number> = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<undefined>(ToInteger, void 0, opts, [IsInteger(info), IsString()]);
  },
  {
    phase: Phase.Coercion,
    message: '.label is invalid',
    decode: ({ value, provide }) => {
      if (!isString(value)) return true;
      const n = Number(value);
      return isInteger(n) ? provide(n) : false;
    },
  },
);

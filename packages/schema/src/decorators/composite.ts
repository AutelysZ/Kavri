import { decode } from '../decode.js';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  type NestedFieldSchema,
  Phase,
  type ValidateOptions,
} from '../field.js';
import { toJsonSchema } from '../jsonschema.js';

/**
 * Union — value must match at least one of `params`. Maps to JSON Schema
 * `anyOf`.
 */
export const AnyOf = createFieldSchemaDecoratorFactory(
  'AnyOf',
  (
    value: readonly NestedFieldSchema[],
    options?: ValidateOptions,
  ): FieldSchemaDecorator<readonly NestedFieldSchema[]> => {
    return FieldSchema<readonly NestedFieldSchema[]>(AnyOf, value, options);
  },
  {
    phase: Phase.Composition,
    message: '.label must match at least one of the allowed schemas',
    decode: ({ value, params }) => {
      for (const schema of params) {
        if (decode(schema, value).ok) return true;
      }
      return false;
    },
    toJsonSchema: (params) => ({ anyOf: params.map((s) => toJsonSchema(s)) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.anyOf ? AnyOf(schema.anyOf.map((s) => fromJsonSchema(s))) : void 0;
    },
  },
);

/**
 * Exactly-one — value must match exactly one of `params`. Zero matches or
 * two-plus matches both fail. Maps to JSON Schema `oneOf`.
 */
export const OneOf = createFieldSchemaDecoratorFactory(
  'OneOf',
  (
    value: readonly NestedFieldSchema[],
    options?: ValidateOptions,
  ): FieldSchemaDecorator<readonly NestedFieldSchema[]> => {
    return FieldSchema<readonly NestedFieldSchema[]>(OneOf, value, options);
  },
  {
    phase: Phase.Composition,
    message: '.label must match exactly one of the allowed schemas',
    decode: ({ value, params }) => {
      let matched = 0;
      for (const schema of params) {
        if (decode(schema, value).ok && ++matched > 1) return false;
      }
      return matched === 1;
    },
    toJsonSchema: (params) => ({ oneOf: params.map((s) => toJsonSchema(s)) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.oneOf ? OneOf(schema.oneOf.map((s) => fromJsonSchema(s))) : void 0;
    },
  },
);

/**
 * Intersection — value must match every schema in `params`. The per-schema
 * `DecodeResult`s are returned so each branch's errors flow into the
 * aggregate report. Maps to JSON Schema `allOf`.
 */
export const AllOf = createFieldSchemaDecoratorFactory(
  'AllOf',
  (
    value: readonly NestedFieldSchema[],
    options?: ValidateOptions,
  ): FieldSchemaDecorator<readonly NestedFieldSchema[]> => {
    return FieldSchema<readonly NestedFieldSchema[]>(AllOf, value, options);
  },
  {
    phase: Phase.Composition,
    message: '',
    decode: ({ value, params }) => params.map((schema) => decode(schema, value)),
    toJsonSchema: (params) => ({ allOf: params.map((s) => toJsonSchema(s)) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.allOf ? AllOf(schema.allOf.map((s) => fromJsonSchema(s))) : void 0;
    },
  },
);

/** Branches for `IfThenElse`. Maps to JSON Schema `if`/`then`/`else`. */
export interface IfThenElseSchema {
  /** Predicate schema. Whether it passes routes to `then` (true) or `else` (false). */
  if: NestedFieldSchema;
  /** Applied when `if` passes. Omitting it means "no further constraint on the matching branch". */
  then?: NestedFieldSchema;
  /** Applied when `if` fails. Omitting it means "no further constraint on the non-matching branch". */
  else?: NestedFieldSchema;
}

/**
 * Conditional — runs `params.if` against the value, then routes to `then` (if
 * the predicate passed) or `else` (if it failed). The `if` branch's own
 * errors are *not* surfaced; only the chosen branch contributes to the
 * result. Omitted branches pass.
 *
 * Maps to the JSON Schema `if` / `then` / `else` keyword triple.
 */
export const IfThenElse = createFieldSchemaDecoratorFactory(
  'IfThenElse',
  (value: IfThenElseSchema, options?: ValidateOptions): FieldSchemaDecorator<IfThenElseSchema> => {
    return FieldSchema<IfThenElseSchema>(IfThenElse, value, options);
  },
  {
    phase: Phase.Composition,
    message: '',
    decode: ({ value, params }) => {
      const branch = decode(params.if, value).ok ? params.then : params.else;
      return branch === undefined ? true : decode(branch, value);
    },
    toJsonSchema: (params) => ({
      if: toJsonSchema(params.if),
      ...(params.then !== undefined && { then: toJsonSchema(params.then) }),
      ...(params.else !== undefined && { else: toJsonSchema(params.else) }),
    }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      if (!schema.if) return void 0;
      const branches: IfThenElseSchema = { if: fromJsonSchema(schema.if) };
      if (schema.then) branches.then = fromJsonSchema(schema.then);
      if (schema.else) branches.else = fromJsonSchema(schema.else);
      return IfThenElse(branches);
    },
  },
);

/**
 * Negation — value must NOT match `params`. Maps to JSON Schema `not`.
 */
export const Not = createFieldSchemaDecoratorFactory(
  'Not',
  (
    value: NestedFieldSchema,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema> => {
    return FieldSchema<NestedFieldSchema>(Not, value, options);
  },
  {
    phase: Phase.Composition,
    message: '.label must not match the negated schema',
    decode: ({ value, params }) => !decode(params, value).ok,
    toJsonSchema: (params) => ({ not: toJsonSchema(params) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.not ? Not(fromJsonSchema(schema.not)) : void 0;
    },
  },
);

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Composite type decorators: IsArray, IsObject, IsRecord, Ref, AnyOf, OneOf, AllOf, IsEnum, IsIn, IsConst.
 */
import type { AnyConstructor } from '@kavri/basic';
import type {
  ArraySchema,
  ObjectSchema,
  AnyOfSchema,
  OneOfSchema,
  AllOfSchema,
  BaseSchema,
  ValidateField,
  ValidateSchema,
  InferredSchema,
  SchemaFieldDecorator,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField, toValidateSchema } from '../field.js';
import { MinItems, MaxItems, UniqueItems, MinProperties, MaxProperties } from './constraints.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayConstraints<T>(schema?: ArraySchema<T>): SchemaFieldDecorator[] {
  const children: SchemaFieldDecorator[] = [];
  if (schema?.minItems !== undefined) children.push(MinItems(schema.minItems));
  if (schema?.maxItems !== undefined) children.push(MaxItems(schema.maxItems));
  if (schema?.uniqueItems !== undefined) children.push(UniqueItems(schema.uniqueItems));
  return children;
}

function objectConstraints(schema?: ObjectSchema<any>): SchemaFieldDecorator[] {
  const children: SchemaFieldDecorator[] = [];
  if (schema?.minProperties !== undefined) children.push(MinProperties(schema.minProperties));
  if (schema?.maxProperties !== undefined) children.push(MaxProperties(schema.maxProperties));
  return children;
}

// ---------------------------------------------------------------------------
// IsArray
// ---------------------------------------------------------------------------

/** Array field. `items` specifies the element type decorator. */
export const IsArray = createSchemaFieldDecoratorFactory(
  <T>(
    items: SchemaFieldDecorator,
    schema?: ArraySchema<T>,
  ): SchemaFieldDecorator<ArraySchema<T>> => {
    return SchemaField(
      IsArray,
      { ...(schema ?? {}), items } as ArraySchema<T>,
      arrayConstraints(schema),
    ) as any;
  },
  {
    rule: 'IsArray',
    validate: (_, v) => Array.isArray(v),
    toJsonSchema: () => ({ type: 'array' }),
  },
);

// ---------------------------------------------------------------------------
// IsObject
// ---------------------------------------------------------------------------

/** Object field with typed properties. */
export const IsObject = createSchemaFieldDecoratorFactory(
  <T extends object>(
    properties: { [K in keyof T]?: SchemaFieldDecorator },
    schema?: ObjectSchema<T>,
  ): SchemaFieldDecorator<ObjectSchema<T>> => {
    return SchemaField(
      IsObject,
      { ...(schema ?? ({} as any)), properties } as any,
      objectConstraints(schema as any),
    ) as any;
  },
  {
    rule: 'IsObject',
    validate: (_, v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    toJsonSchema: () => ({ type: 'object' }),
  },
);

// ---------------------------------------------------------------------------
// IsRecord
// ---------------------------------------------------------------------------

/** Record<string, V> field. `value` specifies the value type decorator. */
export const IsRecord = createSchemaFieldDecoratorFactory(
  <V>(
    value: SchemaFieldDecorator,
    schema?: ObjectSchema<Record<string, V>>,
  ): SchemaFieldDecorator<ObjectSchema<Record<string, V>>> => {
    return SchemaField(
      IsRecord,
      {
        ...(schema ?? {}),
        additionalProperties: value,
      } as ObjectSchema<Record<string, V>>,
      objectConstraints(schema as any),
    ) as any;
  },
  {
    rule: 'IsRecord',
    validate: (_, v) => typeof v === 'object' && v !== null && !Array.isArray(v),
    toJsonSchema: () => ({ type: 'object' }),
  },
);

// ---------------------------------------------------------------------------
// Ref
// ---------------------------------------------------------------------------

/** Reference to a @Schema class. Always lazy (factory function) to handle circular refs. */
export const Ref = createSchemaFieldDecoratorFactory(
  <T extends object>(
    ref: () => AnyConstructor<T>,
    schema?: ObjectSchema<T>,
  ): SchemaFieldDecorator<ValidateSchema<() => AnyConstructor<T>>> => {
    return SchemaField(Ref, { value: ref, ...(schema ?? {}) } as ValidateSchema<
      () => AnyConstructor<T>
    >) as any;
  },
  {
    rule: 'Ref',
    validate: (_, v) => typeof v === 'object' && v !== null,
    // toJsonSchema generates $ref at schema generation time (handled by toJsonSchema utility)
  },
);

// ---------------------------------------------------------------------------
// AnyOf / OneOf / AllOf
// ---------------------------------------------------------------------------

/** Union type: value must match at least one of the given schemas. */
export const AnyOf = createSchemaFieldDecoratorFactory(
  <T>(
    anyOf: SchemaFieldDecorator[],
    schema?: BaseSchema<T>,
  ): SchemaFieldDecorator<AnyOfSchema<T>> => {
    return SchemaField(AnyOf, { ...(schema ?? {}), anyOf } as AnyOfSchema<T>) as any;
  },
  {
    rule: 'AnyOf',
  },
);

/** Exactly-one match: value must match exactly one of the given schemas. */
export const OneOf = createSchemaFieldDecoratorFactory(
  <T>(
    oneOf: SchemaFieldDecorator[],
    schema?: BaseSchema<T>,
  ): SchemaFieldDecorator<OneOfSchema<T>> => {
    return SchemaField(OneOf, { ...(schema ?? {}), oneOf } as OneOfSchema<T>) as any;
  },
  { rule: 'OneOf' },
);

/** Intersection: value must match all of the given schemas. */
export const AllOf = createSchemaFieldDecoratorFactory(
  <T>(
    allOf: SchemaFieldDecorator[],
    schema?: BaseSchema<T>,
  ): SchemaFieldDecorator<AllOfSchema<T>> => {
    return SchemaField(AllOf, { ...(schema ?? {}), allOf } as AllOfSchema<T>) as any;
  },
  { rule: 'AllOf' },
);

// ---------------------------------------------------------------------------
// IsEnum / IsIn / IsConst
// ---------------------------------------------------------------------------

/** Enum field. Accepts a TypeScript enum object. */
export const IsEnum = createSchemaFieldDecoratorFactory(
  <K extends string, V extends string | number, E extends Record<K, V>>(
    host: ValidateField<E>,
    schema?: InferredSchema<V>,
  ): SchemaFieldDecorator<ValidateSchema<E>> => {
    const s = toValidateSchema(host);
    return SchemaField(IsEnum, s as ValidateSchema<E>, schema?.decorators) as any;
  },
  {
    rule: 'IsEnum',
    validate: (p, v) => Object.values(p.value).includes(v as string | number),
    toJsonSchema: (p) => ({ enum: Object.values(p.value) }),
  },
);

/** Value must be one of the given values. */
export const IsIn = createSchemaFieldDecoratorFactory(
  <V extends readonly (string | number)[]>(
    values: ValidateField<V>,
    schema?: InferredSchema<V[number]>,
  ): SchemaFieldDecorator<ValidateSchema<V>> => {
    return SchemaField(
      IsIn,
      toValidateSchema(values) as ValidateSchema<V>,
      schema?.decorators,
    ) as any;
  },
  {
    rule: 'IsIn',
    validate: (p, v) => (p.value as readonly (string | number)[]).includes(v as string | number),
    toJsonSchema: (p) => ({ enum: [...p.value] }),
  },
);

/** Value must be exactly the given constant. */
export const IsConst = createSchemaFieldDecoratorFactory(
  <V>(
    value: ValidateField<V>,
    schema?: InferredSchema<V>,
  ): SchemaFieldDecorator<ValidateSchema<V>> => {
    return SchemaField(IsConst, toValidateSchema(value), schema?.decorators) as any;
  },
  {
    rule: 'IsConst',
    validate: (p, v) => v === p.value,
    toJsonSchema: (p) => ({ const: p.value }),
  },
);

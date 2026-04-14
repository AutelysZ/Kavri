/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * JSON Schema 2020-12 type definition and generation from @Schema classes.
 */
import type { AnyConstructor } from '@kavri/basic';
import { Metadata } from '@kavri/basic';
import type { SchemaFieldDecoratorMetadata } from './types.js';
import { Schema, getSchema } from './schema.js';

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
// toJsonSchema
// ---------------------------------------------------------------------------

/** Collect JSON Schema keywords from a decorator tree. */
function nodeToJsonSchema(meta: SchemaFieldDecoratorMetadata): JsonSchema {
  let schema: JsonSchema = {};

  // Deps contribute first
  for (const dep of meta.deps) {
    schema = { ...schema, ...nodeToJsonSchema(dep.metadata) };
  }

  // Self
  if (meta.factory.toJsonSchema) {
    schema = { ...schema, ...meta.factory.toJsonSchema(meta.params) };
  }

  // Children
  for (const child of meta.children) {
    schema = { ...schema, ...nodeToJsonSchema(child.metadata) };
  }

  return schema;
}

/**
 * Generate JSON Schema 2020-12 from a @Schema class.
 */
export function toJsonSchema(clazz: AnyConstructor<any>): JsonSchema {
  const schemaMeta = Metadata.ofClass(Schema, clazz);
  const options = schemaMeta.length > 0 ? schemaMeta[0].metadata.options : {};

  const fields = getSchema(clazz);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, meta] of fields) {
    const k = String(key);
    const fieldSchema = nodeToJsonSchema(meta);

    // Handle nullable
    if (meta.params.nullable && fieldSchema.type) {
      fieldSchema.type = Array.isArray(fieldSchema.type)
        ? [...fieldSchema.type, 'null']
        : [fieldSchema.type, 'null'];
    }

    // Description from params
    if (meta.params.description) fieldSchema.description = meta.params.description;
    if (meta.params.default !== undefined) fieldSchema.default = meta.params.default;
    if (meta.params.examples) fieldSchema.examples = meta.params.examples;
    if (meta.params.deprecated) fieldSchema.deprecated = meta.params.deprecated;
    if (meta.params.readOnly) fieldSchema.readOnly = meta.params.readOnly;
    if (meta.params.writeOnly) fieldSchema.writeOnly = meta.params.writeOnly;

    properties[k] = fieldSchema;

    // Required unless optional
    if (!meta.params.optional) {
      required.push(k);
    }
  }

  const result: JsonSchema = {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(options.description ? { description: options.description } : {}),
  };

  return result;
}

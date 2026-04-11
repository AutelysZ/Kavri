/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @Schema class decorator, getSchema, defineSchema, and schema utilities:
 * validate, parse, serialize, toJsonSchema.
 */
import { createClassDecorator, Metadata } from '@kavri/basic';
import type { AnyConstructor, ClassDecorator, Qualifier } from '@kavri/basic';
import type { ObjectSchema, JsonSchema, SchemaFieldDecoratorMetadata } from './types.js';
import { getSchemaFields } from './field.js';

// ---------------------------------------------------------------------------
// @Schema decorator
// ---------------------------------------------------------------------------

interface SchemaMetadata {
  options: ObjectSchema<any>;
}

/**
 * Marks a class as a schema. Aggregates all field decorator metadata.
 *
 * @example
 * ```ts
 * @Schema({ description: 'A user' })
 * class User {
 *   @IsString() name!: string;
 *   @IsInteger() age!: number;
 * }
 * ```
 */
export function Schema<T extends object>(
  options?: ObjectSchema<T>,
): ClassDecorator<SchemaMetadata> {
  return createClassDecorator(Schema, { options: (options ?? {}) as ObjectSchema<any> });
}

/**
 * Get resolved schema info for a @Schema class: field names and their metadata.
 */
export function getSchema(
  clazz: AnyConstructor<any>,
): Map<Qualifier, SchemaFieldDecoratorMetadata> {
  const fields = getSchemaFields(clazz);
  const map = new Map<Qualifier, SchemaFieldDecoratorMetadata>();
  for (const [key, meta] of fields) {
    // Multiple decorators on same field — keep the first (outermost)
    if (!map.has(key)) {
      map.set(key, meta);
    }
  }
  return map;
}

/**
 * Programmatically register schema metadata on a class.
 */
export function defineSchema(clazz: AnyConstructor<any>, schema: ObjectSchema<any>): void {
  Metadata.apply(Schema, clazz, { options: schema });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** A single validation issue. */
export interface ValidationIssue {
  path: string[];
  message: string;
  rule: string;
  expected?: unknown;
  received?: unknown;
}

/** Validation error containing all issues. */
export class SchemaValidationError extends Error {
  constructor(
    readonly clazz: AnyConstructor<any>,
    readonly issues: ValidationIssue[],
  ) {
    super(
      `Validation failed for ${clazz.name}: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    this.name = 'SchemaValidationError';
  }
}

/** Validate a single decorator tree node (deps → self → children). */
function validateNode(
  meta: SchemaFieldDecoratorMetadata,
  value: unknown,
  path: string[],
  issues: ValidationIssue[],
): boolean {
  // 1. Deps — if any fail, skip self
  for (const dep of meta.deps) {
    if (!validateNode(dep.metadata, value, path, issues)) {
      return false;
    }
  }

  // 2. Self validation
  if (meta.factory.validate && !meta.factory.validate(meta.params, value)) {
    issues.push({
      path: [...path],
      message: meta.factory.message ?? `${meta.rule} validation failed`,
      rule: meta.rule,
    });
    return false;
  }

  // 3. Children — continue even if some fail
  let allValid = true;
  for (const child of meta.children) {
    if (!validateNode(child.metadata, value, path, issues)) {
      allValid = false;
    }
  }
  return allValid;
}

/** Check required/optional/nullable before field validation. */
function checkPresence(
  params: any,
  value: unknown,
  path: string[],
  issues: ValidationIssue[],
): 'skip' | 'validate' {
  const isOptional = params.optional === true;
  const isNullable = params.nullable === true;

  if (value === undefined) {
    if (!isOptional) {
      issues.push({ path: [...path], message: 'is required', rule: 'required' });
    }
    return 'skip';
  }

  if (value === null) {
    if (!isNullable) {
      issues.push({ path: [...path], message: 'must not be null', rule: 'nullable' });
    }
    return 'skip';
  }

  return 'validate';
}

/**
 * Validate raw data against a @Schema class. Returns null if valid.
 */
export function validate(clazz: AnyConstructor<any>, data: unknown): SchemaValidationError | null {
  if (typeof data !== 'object' || data === null) {
    return new SchemaValidationError(clazz, [
      { path: [], message: 'must be an object', rule: 'type' },
    ]);
  }

  const fields = getSchema(clazz);
  const issues: ValidationIssue[] = [];
  const obj = data as Record<string, unknown>;

  for (const [key, meta] of fields) {
    const fieldPath = [String(key)];
    const value = obj[String(key)];

    const presence = checkPresence(meta.params, value, fieldPath, issues);
    if (presence === 'skip') continue;

    validateNode(meta, value, fieldPath, issues);
  }

  return issues.length > 0 ? new SchemaValidationError(clazz, issues) : null;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Apply parse transforms from a decorator tree (deps → self → children). */
function parseNode(meta: SchemaFieldDecoratorMetadata, value: unknown): unknown {
  // Parse deps first
  for (const dep of meta.deps) {
    value = parseNode(dep.metadata, value);
  }

  // Self parse
  if (meta.factory.parse) {
    value = meta.factory.parse(meta.params, value);
  }

  // Children parse
  for (const child of meta.children) {
    value = parseNode(child.metadata, value);
  }

  return value;
}

/**
 * Parse raw data into a @Schema class instance. Validates and applies parsers.
 * Throws SchemaValidationError on validation failure.
 */
export function parse<T>(clazz: AnyConstructor<T>, data: unknown): T {
  const error = validate(clazz, data);
  if (error) throw error;

  const fields = getSchema(clazz);
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, meta] of fields) {
    const k = String(key);
    const value = obj[k];
    if (value === undefined && meta.params.optional) continue;
    if (value === null && meta.params.nullable) {
      result[k] = null;
      continue;
    }
    result[k] = parseNode(meta, value);
  }

  return Object.assign(Object.create(clazz.prototype), result) as T;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** Apply serialize transforms from a decorator tree (children → self → deps, reverse order). */
function serializeNode(meta: SchemaFieldDecoratorMetadata, value: unknown): unknown {
  // Children first (reverse of parse)
  for (const child of meta.children) {
    value = serializeNode(child.metadata, value);
  }

  // Self serialize
  if (meta.factory.serialize) {
    value = meta.factory.serialize(meta.params, value);
  }

  // Deps (reverse of parse)
  for (const dep of meta.deps) {
    value = serializeNode(dep.metadata, value);
  }

  return value;
}

/**
 * Serialize a @Schema instance to a plain object. Applies serializers.
 */
export function serialize<T extends object>(instance: T): Record<string, unknown> {
  const clazz = instance.constructor as AnyConstructor<T>;
  const fields = getSchema(clazz);
  const result: Record<string, unknown> = {};

  for (const [key, meta] of fields) {
    const k = String(key);
    const value = (instance as Record<string, unknown>)[k];
    if (value === undefined && meta.params.optional) continue;
    result[k] = serializeNode(meta, value);
  }

  return result;
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
  const schemaMeta = Metadata.of(Schema, clazz);
  const options = schemaMeta.length > 0 ? schemaMeta[0].options : {};

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

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyConstructor, ClassDecorator, Qualifier } from '@kavri/basic';
/**
 * @Schema class decorator, getSchema, defineSchema, and schema utilities:
 * validate, parse, serialize.
 */
import { createClassDecorator } from '@kavri/basic';
import type { ObjectSchema, SchemaFieldDecoratorMetadata } from './types.js';
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
  Schema(schema as any)(clazz);
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
  obj: unknown,
  path: string[],
  issues: ValidationIssue[],
): boolean {
  // 1. Deps — if any fail, skip self
  for (const dep of meta.deps) {
    if (!validateNode(dep.metadata, value, obj, path, issues)) {
      return false;
    }
  }

  // 2. Self validation
  if (meta.factory.validate) {
    const result = meta.factory.validate(meta.params, value, obj);
    const valid = Array.isArray(result) ? result[0] : result;
    if (!valid) {
      const msg =
        typeof meta.factory.message === 'function'
          ? meta.factory.message(meta.params)
          : meta.factory.message;
      issues.push({
        path: [...path],
        message: msg ?? `${meta.rule} validation failed`,
        rule: meta.rule,
      });
      return false;
    }
  }

  // 3. Children — continue even if some fail
  let allValid = true;
  for (const child of meta.children) {
    if (!validateNode(child.metadata, value, obj, path, issues)) {
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

    validateNode(meta, value, data, fieldPath, issues);
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

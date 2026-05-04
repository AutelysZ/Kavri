import { type AnyConstructor, Metadata } from '@kavri/basic';
import * as decorators from './decorators/index.js';
import {
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  FromJsonSchemaRegistry,
  isFieldSchemaDecorator,
  type NestedFieldSchema,
} from './field.js';
import { isArray, isFunction, isString } from './utils.js';

// ---------------------------------------------------------------------------
// JSON Schema utils
// ---------------------------------------------------------------------------

/**
 * JSON Schema 2020-12 keywords (subset used by field decorators).
 */
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
  $dynamicAnchor?: string;
  $comment?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  [P: `x-${string}`]: unknown;
}

/**
 * Generate JSON Schema 2020-12 from a `@Schema` class or from an explicit
 * `NestedFieldSchema`. Decorators contribute partial JsonSchema fragments via
 * their `toJsonSchema(params, current)` callbacks; the runner accumulates them
 * in declaration order, passing the running result as `current` so each
 * callback can read what siblings emitted (e.g., `Items` reads `current.items`,
 * `addType` aggregates `current.type`).
 */
export function toJsonSchema(clazz: AnyConstructor): JsonSchema;
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function toJsonSchema(schema: NestedFieldSchema): JsonSchema;
export function toJsonSchema(input: AnyConstructor | NestedFieldSchema): JsonSchema {
  if (isFunction(input) && !isFieldSchemaDecorator(input)) {
    return classToJsonSchema(input as AnyConstructor);
  }
  return rulesToJsonSchema(normalizeSchema(input as NestedFieldSchema));
}

function classToJsonSchema(clazz: AnyConstructor): JsonSchema {
  const fields = Metadata.lookupField(FieldSchema, clazz);
  const out: JsonSchema = { type: 'object' };
  if (!fields || fields.size === 0) return out;
  const properties: Record<string, JsonSchema> = {};
  for (const [key, entries] of fields) {
    properties[String(key)] = rulesToJsonSchema(
      entries as readonly FieldSchemaDecoratorMetadata[],
    );
  }
  out.properties = properties;
  return out;
}

function rulesToJsonSchema(
  rules: readonly FieldSchemaDecoratorMetadata[],
): JsonSchema {
  let current: JsonSchema = {};
  for (const rule of rules) {
    const fn = rule.factory.toJsonSchema;
    if (!fn) continue;
    const partial = fn(rule.params, current);
    if (partial) current = { ...current, ...partial };
  }
  return current;
}

function normalizeSchema(
  schema: NestedFieldSchema,
): readonly FieldSchemaDecoratorMetadata[] {
  if (isArray(schema)) {
    return (
      schema as readonly (FieldSchemaDecorator | FieldSchemaDecoratorMetadata)[]
    ).map(toMetadata);
  }
  return [toMetadata(schema as FieldSchemaDecorator | FieldSchemaDecoratorMetadata)];
}

function toMetadata(
  s: FieldSchemaDecorator | FieldSchemaDecoratorMetadata,
): FieldSchemaDecoratorMetadata {
  return isFieldSchemaDecorator(s) ? s.metadata : s;
}

// ---------------------------------------------------------------------------
// JSON Schema → decorators
// ---------------------------------------------------------------------------

/**
 * Context passed to a decorator factory's `fromJsonSchema` callback.
 *
 * Decorators typically destructure `{ schema, fromJsonSchema, hasType }` and
 * inspect `schema` for keywords they own (e.g. `MinLength` looks at
 * `schema.minLength`). Recursive cases (e.g. `Items` for `schema.items`) call
 * `ctx.fromJsonSchema(nested)` to resolve a sub-schema to nested decorators.
 * `current` exposes the decorators already produced for this schema, so a
 * factory can opt out when a sibling has already claimed something (e.g.
 * `Default` skips when another `Phase.Defaults` rule was registered).
 */
export class FromJsonSchemaContext {
  /** Decorators already produced for this schema (mutable per-iteration). */
  current: readonly FieldSchemaDecorator[];

  constructor(
    /** The JsonSchema being decoded. */
    readonly schema: JsonSchema,
    /** Recursive resolver for nested sub-schemas. */
    readonly fromJsonSchema: (schema: JsonSchema) => NestedFieldSchema,
    current: readonly FieldSchemaDecorator[] = [],
  ) {
    this.current = current;
  }

  /**
   * Whether `schema.type` mentions `t`, accepting either the bare string
   * form (`type: 'string'`) or the array form (`type: ['string', 'null']`).
   */
  readonly hasType = (t: string): boolean => {
    const ty = this.schema.type;
    return (isString(ty) && ty === t) || (isArray(ty) && ty.includes(t));
  };
}

/**
 * Walk the `FromJsonSchemaRegistry` and ask each registered factory whether it
 * recognizes the given JsonSchema. Returns the produced decorators in the
 * order they were registered (which is import-load order; type-asserting
 * factories typically register before constraint factories, so the resulting
 * array is naturally suitable for direct use as a `NestedFieldSchema`).
 *
 * @throws if the eager `decorators/*` import has been tree-shaken away — the
 *   sentinel check exists purely to keep that import alive.
 */
export function fromJsonSchema(schema: JsonSchema): NestedFieldSchema {
  // Side-effect retainer: ensure the decorators graph hasn't been removed by
  // tree-shaking, otherwise the registry would be empty.
  if (!decorators) throw new Error('Decorators namespace cannot be null');

  const out: FieldSchemaDecorator[] = [];
  const recurse = (nested: JsonSchema): NestedFieldSchema => fromJsonSchema(nested);
  const ctx = new FromJsonSchemaContext(schema, recurse, out);
  for (const factory of FromJsonSchemaRegistry) {
    if (!factory.fromJsonSchema) continue;
    ctx.current = out;
    let result: FieldSchemaDecorator | undefined;
    try {
      result = factory.fromJsonSchema(ctx);
    } catch {
      // A miswired factory shouldn't take down the whole resolution — skip it.
      continue;
    }
    if (result) out.push(result);
  }
  return out;
}

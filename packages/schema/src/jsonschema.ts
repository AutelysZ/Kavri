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
import { entryOf, isArray, isFunction, isString } from './utils.js';

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

type JsonSchemaSource =
  | NestedFieldSchema
  | FieldSchemaDecoratorMetadata
  | readonly FieldSchemaDecoratorMetadata[];

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
export function toJsonSchema(schema: JsonSchemaSource): JsonSchema;
export function toJsonSchema(input: AnyConstructor | JsonSchemaSource): JsonSchema {
  if (isFunction(input) && !isFieldSchemaDecorator(input)) {
    return classToJsonSchema(input as AnyConstructor);
  }
  return rulesToJsonSchema(normalizeSchema(input as JsonSchemaSource));
}

function classToJsonSchema(clazz: AnyConstructor): JsonSchema {
  const fields = Metadata.lookupField(FieldSchema, clazz);
  const out: JsonSchema = { type: 'object' };
  if (!fields || fields.size === 0) return out;
  const properties: Record<string, JsonSchema> = {};
  for (const [key, entries] of fields) {
    properties[String(key)] = rulesToJsonSchema(entries as readonly FieldSchemaDecoratorMetadata[]);
  }
  out.properties = properties;
  return out;
}

function rulesToJsonSchema(rules: readonly FieldSchemaDecoratorMetadata[]): JsonSchema {
  let current: JsonSchema = {};
  for (const rule of rules) {
    const fn = rule.factory.toJsonSchema;
    if (!fn) continue;
    const partial = fn({
      params: rule.params,
      current,
      toJsonSchema,
    });
    if (partial) current = { ...current, ...partial };
  }
  return current;
}

function normalizeSchema(schema: JsonSchemaSource): readonly FieldSchemaDecoratorMetadata[] {
  if (isArray(schema)) {
    return (schema as readonly (FieldSchemaDecorator | FieldSchemaDecoratorMetadata)[]).map(
      toMetadata,
    );
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
 * Decoded form of a single JsonSchema:
 *
 * - Object types (`type: 'object'`, or any schema declaring `properties`) are
 *   reconstructed as a synthesized class so the result can be plugged into
 *   places that expect an `AnyConstructor` (e.g. `RouteDefinition.request`).
 * - Everything else is returned as a `FieldSchemaDecorator[]` — the registry's
 *   walk-product, suitable for direct use as a `NestedFieldSchema`.
 */
export type DecodedSchema = AnyConstructor | FieldSchemaDecorator[];

/**
 * Result of {@link fromJsonSchema}.
 *
 * `root` is the decoded form of the input (or, for an array input, the
 * allOf-style merge of every input). `defs` collects everything reachable
 * via `$defs` so that `$ref`s can be resolved and so callers can register
 * the auxiliary classes/decorators alongside the root.
 */
export interface FromJsonSchemaResult {
  root: DecodedSchema;
  defs: Map<string, DecodedSchema>;
}

// multiple inputs is used for cross schema references, it's not allOf. It makes things complex, remove it.
// any type=object with properties will be parsed as a class, others will be parsed as FieldSchemaDecorator[]
export function fromJsonSchema(input: JsonSchema | readonly JsonSchema[]): FromJsonSchemaResult {
  if (!decorators) throw new Error('Decorators namespace cannot be null');
  const defs = new Map<string, DecodedSchema>();
  const inputs = isArray(input) ? input : [input];

  for (const s of inputs) collectDefs(s, defs);

  const merged = inputs.length === 1 ? inputs[0] : mergeAllOf(inputs);
  return { root: decodeRoot(merged, defs), defs };
}

function decodeRoot(schema: JsonSchema, defs: Map<string, DecodedSchema>): DecodedSchema {
  if (schema.$ref?.startsWith('#/$defs/')) {
    const name = schema.$ref.slice('#/$defs/'.length);
    const target = defs.get(name);
    if (target) return target;
  }
  if (isObjectSchema(schema)) return buildObjectClass(schema, defs);
  return decodeDecorators(schema);
}

function decodeDecorators(schema: JsonSchema): FieldSchemaDecorator[] {
  const out: FieldSchemaDecorator[] = [];
  const ctx = new FromJsonSchemaContext(schema, decodeDecorators, out);
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

function buildObjectClass(schema: JsonSchema, defs: Map<string, DecodedSchema>): AnyConstructor {
  class Decoded {}
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const [key, propSchema] of entryOf(schema.properties)) {
      attachProperty(Decoded as AnyConstructor, key, propSchema, defs);
      if (!required.has(key)) {
        decorators.IsOptional()(Decoded.prototype, key);
      }
    }
  }
  return Decoded as AnyConstructor;
}

function attachProperty(
  cls: AnyConstructor,
  key: string,
  schema: JsonSchema,
  defs: Map<string, DecodedSchema>,
): void {
  const decoded = decodeRoot(schema, defs);
  if (typeof decoded === 'function') {
    decorators.Ref(decoded)(cls.prototype, key);
    return;
  }
  for (const dec of decoded) {
    FieldSchema(
      dec.metadata.factory,
      dec.metadata.params,
      dec.metadata.options,
    )(cls.prototype, key);
  }
}

function collectDefs(schema: JsonSchema, defs: Map<string, DecodedSchema>): void {
  if (!schema.$defs) return;
  for (const [name, ds] of entryOf(schema.$defs)) {
    if (defs.has(name)) continue;
    // Insert a placeholder before recursing so cyclic $refs resolve to the
    // same eventual entry instead of looping forever.
    defs.set(name, []);
    defs.set(name, decodeRoot(ds, defs));
    collectDefs(ds, defs);
  }
}

function isObjectSchema(schema: JsonSchema): boolean {
  if (schema.type === 'object') return true;
  if (isArray(schema.type) && schema.type.includes('object')) return true;
  return schema.properties !== undefined;
}

/**
 * Merge an array of input schemas into a single schema with allOf semantics.
 *
 * Object-shaped fields (`properties`, `required`) accumulate; the resulting
 * schema is marked `type: 'object'` if any input was object-shaped. Other
 * keywords are last-wins via `Object.assign`, which is sufficient for
 * decoder-side reconstruction (it does not aim to be a fully general
 * schema combinator).
 */
function mergeAllOf(inputs: readonly JsonSchema[]): JsonSchema {
  const out: JsonSchema = {};
  let anyObject = false;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const s of inputs) {
    Object.assign(out, s);
    if (isObjectSchema(s)) anyObject = true;
    if (s.properties) Object.assign(properties, s.properties);
    if (s.required) required.push(...s.required);
  }

  if (anyObject) {
    out.type = 'object';
    if (Object.keys(properties).length > 0) out.properties = properties;
    if (required.length > 0) out.required = [...new Set(required)];
  }
  return out;
}

import type { AnyConstructor } from '@kavri/basic';
import * as registry from './decorators/registry.jsonschema.js';
import type { FieldSchemaDecorator, FieldSchemaDecoratorFactory, NestedFieldSchema } from './field.js';
import { valueOf } from './utils.js';

// ---------------------------------------------------------------------------
// JSON Schema utils
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
  [P: `x-${string}`]: unknown;
}

/**
 * Generate JSON Schema 2020-12 from a @Schema class.
 */
export function toJsonSchema(clazz: AnyConstructor): JsonSchema;
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function toJsonSchema(schema: NestedFieldSchema): JsonSchema;
export function toJsonSchema(clazz: AnyConstructor | NestedFieldSchema): JsonSchema {
  throw new Error('Not implemented');
}

const DECORATORS: FieldSchemaDecoratorFactory[] = valueOf(registry);

export function fromJsonSchema(schema: JsonSchema): FieldSchemaDecorator[] {
  const out: FieldSchemaDecorator[] = [];
}

import { decode } from '../decode.js';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  type NestedFieldSchema,
  ofNestedField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { isString } from '../utils.js';
import { IsString, type StringOptions } from './string.js';

/**
 * Validate the *parsed* content of a string against a nested schema. Runs in
 * `Phase.Property`, after `Phase.ContentType` has decoded the string (e.g.
 * `IsJSON` parsing) so `ctx.value` is the parsed value, not the raw string.
 *
 * Maps to JSON Schema `contentSchema`.
 */
export const ContentSchema = createFieldSchemaDecoratorFactory(
  'ContentSchema',
  (
    value: NestedFieldSchema,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema> => {
    return FieldSchema<NestedFieldSchema>(ContentSchema, value, options);
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params }) => decode(params, value),
    default: ({ params, defaultOf }) => defaultOf(params),
    toJsonSchema: ({ params, toJsonSchema }) => ({ contentSchema: toJsonSchema(params) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.contentSchema ? ContentSchema(fromJsonSchema(schema.contentSchema)) : void 0;
    },
  },
);

/**
 * Validate that a string is parseable JSON. Composes `IsString(schema)` as a
 * dep so non-string inputs are rejected at the type phase.
 *
 * - `decode` (Phase.ContentType): parses the string with `JSON.parse` and
 *   `provide`s the parsed value to downstream rules.
 * - `encode`: re-stringifies non-string values via `JSON.stringify`.
 *
 * Maps to JSON Schema `{ contentMediaType: 'application/json' }`. Pair with a
 * sibling `ContentSchema` for nested validation of the parsed payload.
 */
export const IsJSON = createFieldSchemaDecoratorFactory(
  'IsJSON',
  (
    contentSchema: ValidateField<NestedFieldSchema> | undefined,
    schema: StringOptions = {},
  ): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    const deps: FieldSchemaDecorator[] = [IsString(info)];
    if (contentSchema !== void 0) deps.push(ContentSchema(...ofNestedField(contentSchema)));
    return FieldSchema<undefined>(IsJSON, void 0, opts, deps);
  },
  {
    phase: Phase.ContentType,
    message: '.label must be valid JSON',
    decode: ({ value, provide }) => {
      if (!isString(value)) return true;
      return provide(JSON.parse(value));
    },
    encode: ({ value }) => JSON.stringify(value),
    toJsonSchema: () => ({ contentMediaType: 'application/json' }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.contentMediaType === 'application/json' ? IsJSON(void 0) : void 0;
    },
  },
);

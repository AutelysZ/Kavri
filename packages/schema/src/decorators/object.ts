import type { AnyConstructor } from '@kavri/basic';
import type { DecodeResult } from '../decode.js';
import { decode } from '../decode.js';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  type NestedFieldSchema,
  ofArrayField,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import type { JsonSchema } from '../jsonschema.js';
import { getSchema } from '../schema.js';
import {
  addType,
  entryOf,
  hasOwn,
  isArray,
  isBoolean,
  isInstanceOf,
  isMap,
  isNumber,
  isPlainObject,
  isString,
  keyOf,
  type PartialRecord,
  typeOf,
  type TypeOf,
} from '../utils.js';
import { type BaseOptions, decoupleTypeOptions, Info, type TypeOptions } from './base.js';

const is = (v: unknown) => isPlainObject(v) || isMap(v);

const get = (v: object, k: unknown) => (isMap(v) ? v.get(k) : v[k as never]);

const has = (v: object, k: unknown) => (isMap(v) ? v.has(k) : hasOwn(v, k as never));

const keys = (v: object) => (isMap(v) ? (v.keys() as Iterable<string>) : keyOf(v));

/**
 * Validate declared object properties against per-key schemas.
 *
 * For each `(key, schema)` pair in `params`, the property at `key` (when
 * present in the instance) is validated against `schema`. Each handled key is
 * recorded in `DecodeContext.evaluated` so that sibling `AdditionalProperties`
 * and `UnevaluatedProperties` can skip already-covered keys.
 *
 * Maps to JSON Schema `properties`.
 */
export const Properties = createFieldSchemaDecoratorFactory(
  'Properties',
  <T extends object>(
    value: PartialRecord<keyof T, NestedFieldSchema>,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<PartialRecord<keyof T, NestedFieldSchema>> => {
    return FieldSchema<PartialRecord<keyof T, NestedFieldSchema>>(
      Properties as never,
      value,
      options,
    );
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, child, params, evaluated }) => {
      if (!is(value)) {
        return true;
      }
      const out: DecodeResult[] = [];
      for (const [k, v] of entryOf(params as Record<string, NestedFieldSchema>)) {
        if (v === undefined || !has(value, k)) {
          continue;
        }
        out.push(decode(child(k, get(value, k), v)));
        evaluated.add(k);
      }
      return out;
    },
    default: ({ params, defaultOf }) => {
      const out: Record<string, unknown> = {};
      for (const [key, schema] of entryOf(params as Record<string, NestedFieldSchema>)) {
        if (schema !== undefined) out[key] = defaultOf(schema);
      }
      return out;
    },
    toJsonSchema: ({ params, current, toJsonSchema }) => {
      const out: Record<string, JsonSchema> = current.properties || {};
      for (const [k, v] of entryOf(params as Record<string, NestedFieldSchema>)) {
        if (v !== undefined) {
          out[k] = toJsonSchema(v);
        }
      }
      return { properties: out };
    },
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      if (!schema.properties) {
        return void 0;
      }
      const props: Record<string, NestedFieldSchema> = {};
      for (const [k, v] of entryOf(schema.properties)) {
        props[k] = fromJsonSchema(v);
      }
      return Properties(props);
    },
  },
);

/**
 * Validate properties whose names match a regular expression.
 *
 * For each `(pattern, schema)` pair in `params`, every property of the
 * instance whose key matches `pattern` is validated against `schema`. Matched
 * keys are added to `DecodeContext.evaluated` so that `AdditionalProperties`
 * and `UnevaluatedProperties` can exclude them.
 *
 * Maps to JSON Schema `patternProperties`.
 */
export const PatternProperties = createFieldSchemaDecoratorFactory(
  'PatternProperties',
  (
    value: Record<string, NestedFieldSchema>,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<Record<string, NestedFieldSchema>> => {
    return FieldSchema(PatternProperties, value, options);
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params, child, evaluated }) => {
      if (!is(value)) {
        return true;
      }
      const out: DecodeResult[] = [];
      for (const [pattern, schema] of entryOf(params)) {
        const re = new RegExp(pattern);
        for (const k of keys(value)) {
          if (re.test(k)) {
            out.push(decode(child(k, get(value, k), schema)));
            evaluated.add(k);
          }
        }
      }
      return out;
    },
    toJsonSchema: ({ params, toJsonSchema }) => {
      const out: Record<string, JsonSchema> = {};
      for (const [k, v] of entryOf(params)) {
        out[k] = toJsonSchema(v);
      }
      return { patternProperties: out };
    },
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      if (!schema.patternProperties) {
        return void 0;
      }
      const out: Record<string, NestedFieldSchema> = {};
      for (const [k, v] of entryOf(schema.patternProperties)) {
        out[k] = fromJsonSchema(v);
      }
      return PatternProperties(out);
    },
  },
);

/**
 * Validate every property name (key) of the instance against a single schema.
 *
 * Maps to JSON Schema `propertyNames`.
 */
export const PropertyNames = createFieldSchemaDecoratorFactory(
  'PropertyNames',
  (
    value: NestedFieldSchema,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema> => {
    return FieldSchema(PropertyNames, value, options);
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params, child }) => {
      if (!is(value)) {
        return true;
      }
      const out: DecodeResult[] = [];
      for (const k of keys(value)) {
        out.push(decode(child(k, k, params)));
      }
      return out;
    },
    toJsonSchema: ({ params, toJsonSchema }) => ({ propertyNames: toJsonSchema(params) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.propertyNames === void 0
        ? void 0
        : PropertyNames(fromJsonSchema(schema.propertyNames));
    },
  },
);

/**
 * Validate properties not covered by sibling `Properties` or `PatternProperties`.
 *
 * Per JSON Schema 2020-12 semantics, `additionalProperties` is sibling-local:
 * it scans `ctx.rules` for sibling `Properties` / `PatternProperties` metadata
 * (NOT `ctx.evaluated`, which crosses composition boundaries — that's
 * `unevaluatedProperties`). Runs in `Phase.Property` alongside its peers.
 *
 * When `params` is `false` the instance must have no extra properties; when
 * `params` is a schema each extra property must match it. Matched keys are
 * added to `ctx.evaluated` so `UnevaluatedProperties` will skip them.
 *
 * Maps to JSON Schema `additionalProperties`.
 */
export const AdditionalProperties = createFieldSchemaDecoratorFactory(
  'AdditionalProperties',
  (
    value: NestedFieldSchema | boolean,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema | boolean> => {
    return FieldSchema(AdditionalProperties, value, options);
  },
  {
    phase: Phase.Property,
    message: '.label has additional properties',
    decode: ({ value, child, params, rules, currentRule, evaluated }) => {
      if (!is(value) || params === true) {
        return true;
      }
      const declared = new Set<string>();
      const patterns: RegExp[] = [];
      for (const rule of rules) {
        if (rule === currentRule) {
          continue;
        }
        if (rule.factory === Properties) {
          const props = rule.params as Record<string, NestedFieldSchema>;
          if (props) {
            for (const k of keys(props)) {
              declared.add(k);
            }
          }
        } else if (rule.factory === PatternProperties) {
          const pats = rule.params as Record<string, NestedFieldSchema>;
          if (pats) {
            for (const re of keys(pats)) {
              patterns.push(new RegExp(re));
            }
          }
        }
      }
      const extras = [...keys(value)].filter(
        (k) => !declared.has(k) && !patterns.some((re) => re.test(k)),
      );
      if (extras.length === 0) {
        return true;
      }
      if (params === false) {
        return false;
      }
      const out: DecodeResult[] = [];
      for (const k of extras) {
        out.push(decode(child(k, get(value, k), params)));
        evaluated.add(k);
      }
      return out;
    },
    toJsonSchema: ({ params, toJsonSchema }) => ({
      additionalProperties: isBoolean(params) ? params : toJsonSchema(params),
    }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      const ap = schema.additionalProperties;
      if (ap === void 0 || ap === true) {
        return void 0;
      }
      if (ap === false) {
        return AdditionalProperties(false);
      }
      return AdditionalProperties(fromJsonSchema(ap));
    },
  },
);

/**
 * Validate properties not "evaluated" by any sibling property-phase decorator.
 *
 * Runs in `Phase.AdditionalConstraints`, after `AdditionalProperties`, so any
 * keys handled by `Properties` / `PatternProperties` / `AdditionalProperties`
 * are excluded via `ctx.evaluated`. When `params` is `false`, no unevaluated
 * properties are allowed; when `params` is a schema, each unevaluated property
 * must match.
 *
 * Maps to JSON Schema `unevaluatedProperties`.
 */
export const UnevaluatedProperties = createFieldSchemaDecoratorFactory(
  'UnevaluatedProperties',
  (
    value: NestedFieldSchema | boolean,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema | boolean> => {
    return FieldSchema(UnevaluatedProperties, value, options);
  },
  {
    phase: Phase.AdditionalConstraints,
    message: '.label has unevaluated properties',
    decode: ({ value, params, evaluated, child }) => {
      if (!is(value) || params === true) {
        return true;
      }
      const extras = [...keys(value)].filter((k) => !evaluated.has(k));
      if (extras.length === 0) {
        return true;
      }
      if (params === false) {
        return false;
      }
      const out: DecodeResult[] = [];
      for (const k of extras) {
        out.push(decode(child(k, get(value, k), params)));
        evaluated.add(k);
      }
      return out;
    },
    toJsonSchema: ({ params, toJsonSchema }) => ({
      unevaluatedProperties: isBoolean(params) ? params : toJsonSchema(params),
    }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      const up = schema.unevaluatedProperties;
      if (up === void 0 || up === true) {
        return void 0;
      }
      if (up === false) {
        return UnevaluatedProperties(false);
      }
      return UnevaluatedProperties(fromJsonSchema(up));
    },
  },
);

/**
 * Object must have at least `params` own enumerable properties.
 *
 * Maps to JSON Schema `minProperties`.
 */
export const MinProperties = createFieldSchemaDecoratorFactory(
  'MinProperties',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MinProperties, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must have at least .params properties',
    decode: ({ value, params }) => {
      return !is(value) || [...keys(value)].length >= params;
    },
    toJsonSchema: ({ params }) => ({ minProperties: params }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined =>
      isNumber(schema.minProperties) ? MinProperties(schema.minProperties) : void 0,
  },
);

/**
 * Object must have at most `params` own enumerable properties.
 *
 * Maps to JSON Schema `maxProperties`.
 */
export const MaxProperties = createFieldSchemaDecoratorFactory(
  'MaxProperties',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MaxProperties, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must have at most .params properties',
    decode: ({ value, params }) => {
      return !is(value) || [...keys(value)].length <= params;
    },
    toJsonSchema: ({ params }) => ({ maxProperties: params }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined =>
      isNumber(schema.maxProperties) ? MaxProperties(schema.maxProperties) : void 0,
  },
);

/**
 * The instance must have every key listed in `params`.
 *
 * Maps to JSON Schema `required`.
 */
export const Required = createFieldSchemaDecoratorFactory(
  'Required',
  <T extends object>(
    value: readonly (keyof T)[],
    options?: ValidateOptions,
  ): FieldSchemaDecorator<readonly (keyof T)[]> => {
    return FieldSchema<readonly (keyof T)[]>(Required as never, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label is missing required properties',
    decode: ({ value, params }) => {
      if (!is(value)) {
        return true;
      }
      return (params as readonly PropertyKey[]).every((k) => has(value, k));
    },
    toJsonSchema: ({ params }) => ({ required: params as readonly unknown[] as string[] }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.required && schema.required.length > 0
        ? Required(schema.required as never)
        : void 0;
    },
  },
);

/**
 * Conditional presence: when a key is present in the instance, every key in
 * its dependency list must also be present.
 *
 * Maps to JSON Schema `dependentRequired`.
 */
export const DependentRequired = createFieldSchemaDecoratorFactory(
  'DependentRequired',
  <T extends object>(
    value: PartialRecord<keyof T, readonly (keyof T)[]>,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<PartialRecord<keyof T, readonly (keyof T)[]>> => {
    return FieldSchema<PartialRecord<keyof T, readonly (keyof T)[]>>(
      DependentRequired as never,
      value,
      options,
    );
  },
  {
    phase: Phase.Semantics,
    message: '.label has unsatisfied dependent required properties',
    decode: ({ value, params }) => {
      if (!is(value)) {
        return true;
      }
      const map = params as Record<string, readonly PropertyKey[] | undefined>;
      for (const [k, deps] of entryOf(map)) {
        if (!deps || !has(value, k)) {
          continue;
        }
        for (const dep of deps) {
          if (!has(value, dep)) {
            return false;
          }
        }
      }
      return true;
    },
    toJsonSchema: ({ params }) => {
      const out: Record<string, string[]> = {};
      for (const [k, v] of entryOf(params as Record<string, readonly string[] | undefined>)) {
        if (v) {
          out[k] = [...v];
        }
      }
      return { dependentRequired: out };
    },
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.dependentRequired
        ? DependentRequired(schema.dependentRequired as Record<string, string[]>)
        : void 0;
    },
  },
);

/**
 * Conditional schema: when a key is present in the instance, the entire
 * instance must additionally validate against the associated schema.
 *
 * Maps to JSON Schema `dependentSchemas`.
 */
export const DependentSchemas = createFieldSchemaDecoratorFactory(
  'DependentSchemas',
  <T extends object>(
    value: PartialRecord<keyof T, NestedFieldSchema>,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<PartialRecord<keyof T, NestedFieldSchema>> => {
    return FieldSchema<PartialRecord<keyof T, NestedFieldSchema>>(
      DependentSchemas as never,
      value,
      options,
    );
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params }) => {
      if (!is(value)) {
        return true;
      }
      const out: DecodeResult[] = [];
      for (const [k, schema] of entryOf(params)) {
        if (schema === undefined || !has(value, k)) {
          continue;
        }
        out.push(decode(schema, value));
      }
      return out;
    },
    toJsonSchema: ({ params, toJsonSchema }) => {
      const out: Record<string, JsonSchema> = {};
      for (const [k, v] of entryOf(params as Record<string, NestedFieldSchema | undefined>)) {
        if (v !== undefined) {
          out[k] = toJsonSchema(v);
        }
      }
      return { dependentSchemas: out };
    },
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      if (!schema.dependentSchemas) {
        return void 0;
      }
      const out: Record<string, NestedFieldSchema> = {};
      for (const [k, v] of entryOf(schema.dependentSchemas)) {
        out[k] = fromJsonSchema(v);
      }
      return DependentSchemas(out);
    },
  },
);

/**
 * Schema options for object fields.
 */
export interface ObjectOptions<T extends object = object> extends TypeOptions<T> {
  properties?: PartialRecord<keyof T, NestedFieldSchema>;
  patternProperties?: Record<string, NestedFieldSchema>;
  additionalProperties?: NestedFieldSchema | boolean;
  unevaluatedProperties?: NestedFieldSchema | boolean;
  propertyNames?: NestedFieldSchema;
  maxProperties?: ValidateField<number>;
  minProperties?: ValidateField<number>;
  required?: ValidateField<readonly (keyof T)[]>;
  dependentRequired?: PartialRecord<keyof T, readonly (keyof T)[]>;
  dependentSchemas?: PartialRecord<keyof T, NestedFieldSchema>;
}

/**
 * Object field. Composes `Info` plus all `ObjectOptions` constraint decorators
 * (Properties, PatternProperties, PropertyNames, DependentSchemas,
 * MinProperties, MaxProperties, Required, DependentRequired,
 * AdditionalProperties, UnevaluatedProperties) as deps.
 *
 * The first positional `properties` argument is a shorthand and is merged
 * with `options.properties` (Properties is added once for each that's set, in
 * argument order).
 *
 * @example
 * ```ts
 * @IsObject({ name: IsString() }, { required: ['name'] })
 * user!: { name: string };
 * ```
 */
export const IsObject = createFieldSchemaDecoratorFactory(
  'IsObject',
  <T extends object>(
    properties?: PartialRecord<keyof T, NestedFieldSchema>,
    {
      properties: _properties,
      patternProperties,
      additionalProperties,
      unevaluatedProperties,
      propertyNames,
      maxProperties,
      minProperties,
      required,
      dependentRequired,
      dependentSchemas,
      ...options
    }: ObjectOptions<T> = {},
  ): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleTypeOptions(options);
    const deps: FieldSchemaDecorator[] = [Info(info)];
    if (properties !== undefined) deps.push(Properties(properties));
    if (_properties !== undefined) deps.push(Properties(_properties));
    if (patternProperties !== undefined) deps.push(PatternProperties(patternProperties));
    if (propertyNames !== undefined) deps.push(PropertyNames(propertyNames));
    if (dependentSchemas !== undefined) deps.push(DependentSchemas(dependentSchemas));
    if (minProperties !== undefined) deps.push(MinProperties(...ofValueField(minProperties)));
    if (maxProperties !== undefined) deps.push(MaxProperties(...ofValueField(maxProperties)));
    if (required !== undefined) deps.push(Required(...ofArrayField(required)));
    if (dependentRequired !== undefined) deps.push(DependentRequired(dependentRequired));
    if (additionalProperties !== undefined) deps.push(AdditionalProperties(additionalProperties));
    if (unevaluatedProperties !== undefined)
      deps.push(UnevaluatedProperties(unevaluatedProperties));
    return FieldSchema<undefined>(options.type === false ? Dummy : IsObject, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: '.label must be an object',
    decode: ({ value }) => isPlainObject(value),
    default: () => ({}),
    toJsonSchema: addType('object'),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined => {
      return hasType('object') ? IsObject(void 0) : void 0;
    },
  },
);

/**
 * Map-like object: every value is validated against `value`. Equivalent to
 * `IsObject(undefined, { ...schema, additionalProperties: value })`.
 *
 * @example
 * ```ts
 * @IsRecord(IsString())
 * tags!: Record<string, string>;
 * ```
 */
export function IsRecord<V>(
  value: NestedFieldSchema,
  schema: ObjectOptions<Record<string, V>> = {},
): FieldSchemaDecorator<undefined> {
  return IsObject(void 0, { ...schema, additionalProperties: value });
}

export const IsMap = createFieldSchemaDecoratorFactory(
  'IsMap',
  <V>(
    value?: NestedFieldSchema,
    schema: ObjectOptions<Record<string, V>> = {},
  ): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema(IsMap, undefined, opts, [
      IsObject(void 0, { ...info, additionalProperties: value }),
      IsInstanceOf(Map),
    ]);
  },
  {
    phase: Phase.Coercion,
    message: '.label should be a map',
    decode: ({ value, provide }) => {
      if (isMap(value)) return true;
      if (!isPlainObject(value)) return true;
      return provide(new Map(entryOf(value)));
    },
    default: () => new Map(),
    encode: ({ value }) => (isMap(value) ? Object.fromEntries(value) : value),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return !schema.properties && (schema.properties || schema.patternProperties)
        ? IsMap()
        : void 0;
    },
  },
);

/**
 * Reference to another `@Schema` class. The instance is validated against the
 * referenced class's full schema. Use the tuple form `Ref([() => Class])` or
 * `Ref.lazy(() => Class)` to break cyclic class references.
 *
 * The generated JSON Schema emits a `$ref` to a definition placed in `$defs`,
 * keyed by the class's `slug` (from `@Schema`) or its `name`.
 *
 * @example
 * ```ts
 * @Ref(User)
 * owner!: User;
 *
 * @Ref.lazy(() => Tree)
 * parent!: Tree;
 * ```
 */
export const Ref = createFieldSchemaDecoratorFactory(
  'Ref',
  <T extends object>(
    ref: AnyConstructor<T> | [() => AnyConstructor<T>],
    options: TypeOptions<T> = {},
  ): FieldSchemaDecorator<() => AnyConstructor<T>> => {
    const [opts, info] = decoupleOptions(options);
    const thunk = isArray(ref) ? ref[0] : () => ref;
    const deps: FieldSchemaDecorator[] = [IsObject(void 0, info), IsInstanceOf([thunk], opts)];
    return FieldSchema<() => AnyConstructor<T>>(Ref as never, thunk, opts, deps);
  },
  {
    phase: Phase.Property,
    message: '.label must conform to the referenced schema',
    decode: ({ value, params, decode, provide }) => {
      const target = params();
      if (isInstanceOf(value, target)) return provide(value);
      if (isPlainObject(value)) return decode(target, value);
      return true;
    },
    default: ({ params, defaultOf }) => defaultOf(params()),
    toJsonSchema: ({ params, toJsonSchema }) => {
      const clazz = params();
      const key = getSchema(clazz)?.slug ?? clazz.name;
      return {
        $ref: `#/$defs/${key}`,
        $defs: { [key]: toJsonSchema(clazz) },
      };
    },
  },
  {
    lazy: <T extends object>(ref: () => AnyConstructor<T>, options?: BaseOptions<T>) =>
      Ref([ref], options),
  },
);

/**
 * The input MUST be an instanceof specified class.
 *
 * This is different from {@link Ref}, `Ref` accepts plain object and will
 * instantiate the target class automatically. `IsInstanceOf` requires the
 * input be the instanceof the target class, no transform.
 */
export const IsInstanceOf = createFieldSchemaDecoratorFactory(
  'IsInstanceOf',
  (
    clazz: AnyConstructor | TypeOf | [() => AnyConstructor] /* lazy */,
    options: ValidateOptions = {},
  ): FieldSchemaDecorator<() => AnyConstructor | TypeOf> => {
    const thunk = isArray(clazz) ? clazz[0] : () => clazz as AnyConstructor | TypeOf;
    return FieldSchema<() => AnyConstructor | TypeOf>(IsInstanceOf, thunk, options);
  },
  {
    phase: Phase.Type,
    message: ({ params, value }) =>
      `.label should be an instance of ${isString(params()) ? params() : (params() as AnyConstructor).name}, got ${typeof value}`,
    decode: ({ params, value }) => {
      const v = params();
      return isString(v) ? typeOf(v) === value : value instanceof v;
    },
    default: ({ provide }) => provide(undefined),
  },
  {
    lazy: (clazz: () => AnyConstructor, options?: ValidateOptions) => {
      return IsInstanceOf([clazz], options);
    },
  },
);

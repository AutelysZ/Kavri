import { decode } from '../decode.js';
import {
  createFieldSchemaDecoratorFactory,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  type NestedFieldSchema,
  ofArrayField,
  ofBoolField,
  ofNestedField,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { toJsonSchema } from '../jsonschema.js';
import { addType, isArray, isEqual, isNumber } from '../utils.js';
import { decoupleTypeOptions, Info, type TypeOptions } from './base.js';

export const Items = createFieldSchemaDecoratorFactory(
  'Items',
  (
    value: NestedFieldSchema,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema> => {
    return FieldSchema(Items, value, options);
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params, child }) => {
      if (!isArray(value)) return true;
      return value.map((item, index) => decode(child(index + '', item, params)));
    },
    toJsonSchema: (p, current) => ({
      items: { ...current.items, ...toJsonSchema(p) },
    }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.items === void 0 ? void 0 : Items(fromJsonSchema(schema.items));
    },
  },
);

export const PrefixItems = createFieldSchemaDecoratorFactory(
  'PrefixItems',
  (
    value: readonly NestedFieldSchema[],
    options?: ValidateOptions,
  ): FieldSchemaDecorator<readonly NestedFieldSchema[]> => {
    return FieldSchema(PrefixItems, value, options);
  },
  {
    phase: Phase.Property,
    message: '',
    decode: ({ value, params, child }) => {
      if (!isArray(value)) return true;
      const limit = Math.min(value.length, params.length);
      return value.slice(0, limit).map((item, i) => decode(child(i + '', item, params[i])));
    },
    toJsonSchema: (p) => ({ prefixItems: p.map((s) => toJsonSchema(s)) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.prefixItems === void 0
        ? void 0
        : PrefixItems(schema.prefixItems.map((s) => fromJsonSchema(s)));
    },
  },
);

const CONTAINS_PREFIX = 'contains:';

function containsKey(index: number): string {
  return CONTAINS_PREFIX + index;
}

function containsCount(evaluated: ReadonlySet<string>): number {
  let count = 0;
  for (const k of evaluated) {
    if (k.startsWith(CONTAINS_PREFIX)) count++;
  }
  return count;
}

function isEvaluatedIndex(evaluated: ReadonlySet<string>, index: number): boolean {
  const s = index + '';
  return evaluated.has(s) || evaluated.has(CONTAINS_PREFIX + s);
}

export const Contains = createFieldSchemaDecoratorFactory(
  'Contains',
  (
    value: NestedFieldSchema,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema> => {
    return FieldSchema(Contains, value, options);
  },
  {
    phase: Phase.Property,
    message: '.label must contain at least one matching element',
    decode: ({ value, params, child, evaluated }) => {
      if (!isArray(value)) return true;
      let matched = 0;
      for (let i = 0; i < value.length; i++) {
        if (decode(child(i + '', value[i], params)).ok) {
          evaluated.add(containsKey(i));
          matched++;
        }
      }
      return matched > 0;
    },
    toJsonSchema: (p) => ({ contains: toJsonSchema(p) }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      return schema.contains === void 0 ? void 0 : Contains(fromJsonSchema(schema.contains));
    },
  },
);

export const MinContains = createFieldSchemaDecoratorFactory(
  'MinContains',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MinContains, value, options);
  },
  {
    phase: Phase.AdditionalConstraints,
    message: '.label must contain at least .params matching elements',
    decode: ({ value, params, evaluated }) => {
      if (!isArray(value)) return true;
      return containsCount(evaluated) >= params;
    },
    toJsonSchema: (p) => ({ minContains: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.minContains) ? MinContains(schema.minContains) : void 0;
    },
  },
);

export const MaxContains = createFieldSchemaDecoratorFactory(
  'MaxContains',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MaxContains, value, options);
  },
  {
    phase: Phase.AdditionalConstraints,
    message: '.label must contain at most .params matching elements',
    decode: ({ value, params, evaluated }) => {
      if (!isArray(value)) return true;
      return containsCount(evaluated) <= params;
    },
    toJsonSchema: (p) => ({ maxContains: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.maxContains) ? MaxContains(schema.maxContains) : void 0;
    },
  },
);

export const MinItems = createFieldSchemaDecoratorFactory(
  'MinItems',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MinItems, value, options);
  },
  {
    phase: Phase.Property,
    message: '.label has at least .params elements',
    decode: ({ value, params }) => !isArray(value) || value.length >= params,
    toJsonSchema: (p) => ({ minItems: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.minItems) ? MinItems(schema.minItems) : void 0;
    },
  },
);

export const MaxItems = createFieldSchemaDecoratorFactory(
  'MaxItems',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MaxItems, value, options);
  },
  {
    phase: Phase.Property,
    message: '.label can contain at most .params elements',
    decode: ({ value, params }) => !isArray(value) || value.length <= params,
    toJsonSchema: (p) => ({ maxItems: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return isNumber(schema.maxItems) ? MaxItems(schema.maxItems) : void 0;
    },
  },
);

export const UniqueItems = createFieldSchemaDecoratorFactory(
  'UniqueItems',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(UniqueItems, void 0, options);
  },
  {
    phase: Phase.Property,
    message: 'All elements of .label must be unique',
    decode: ({ value }) => {
      if (!isArray(value)) {
        return true;
      }
      return value.every((item, index) => {
        for (let i = index + 1; i < value.length; i++) {
          if (isEqual(item, value[i])) {
            return false;
          }
        }
        return true;
      });
    },
    toJsonSchema: () => ({ uniqueItems: true }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.uniqueItems ? UniqueItems() : void 0;
    },
  },
);

export const UnevaluatedItems = createFieldSchemaDecoratorFactory(
  'UnevaluatedItems',
  (
    value: NestedFieldSchema | false,
    options?: ValidateOptions,
  ): FieldSchemaDecorator<NestedFieldSchema | false> => {
    return FieldSchema(UnevaluatedItems, value, options);
  },
  {
    phase: Phase.AdditionalConstraints,
    message: '.label has unevaluated items',
    decode: ({ value, params, child, evaluated }) => {
      if (!isArray(value)) return true;
      const unevaluated: number[] = [];
      for (let i = 0; i < value.length; i++) {
        if (!isEvaluatedIndex(evaluated, i)) unevaluated.push(i);
      }
      if (unevaluated.length === 0) return true;
      if (params === false) return false;
      return unevaluated.map((i) => decode(child(i + '', value[i], params)));
    },
    toJsonSchema: (p) => ({
      unevaluatedItems: p === false ? false : toJsonSchema(p),
    }),
    fromJsonSchema: ({ schema, fromJsonSchema }): FieldSchemaDecorator | undefined => {
      const u = schema.unevaluatedItems;
      if (u === void 0 || u === true) return void 0;
      if (u === false) return UnevaluatedItems(false);
      return UnevaluatedItems(fromJsonSchema(u));
    },
  },
);

export interface ArrayOptions<T = unknown> extends TypeOptions<T[]> {
  items?: ValidateField<NestedFieldSchema>;
  prefixItems?: ValidateField<readonly NestedFieldSchema[]>;
  contains?: ValidateField<NestedFieldSchema>;
  minContains?: ValidateField<number>;
  maxContains?: ValidateField<number>;
  minItems?: ValidateField<number>;
  maxItems?: ValidateField<number>;
  uniqueItems?: ValidateField<boolean>;
  unevaluatedItems?: NestedFieldSchema | false;
}

export const IsArray = createFieldSchemaDecoratorFactory(
  'IsArray',
  <T>(
    items?: ValidateField<NestedFieldSchema>,
    {
      items: _items,
      prefixItems,
      contains,
      minContains,
      maxContains,
      minItems,
      maxItems,
      uniqueItems,
      unevaluatedItems,
      ...options
    }: ArrayOptions<T> = {},
  ): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleTypeOptions(options);
    const deps: FieldSchemaDecorator[] = [Info(info)];
    if (items !== undefined) deps.push(Items(...ofNestedField(items)));
    if (_items !== undefined) deps.push(Items(...ofNestedField(_items)));
    if (prefixItems !== undefined) deps.push(PrefixItems(...ofArrayField(prefixItems)));
    if (contains !== undefined) deps.push(Contains(...ofNestedField(contains)));
    if (minContains !== undefined) deps.push(MinContains(...ofValueField(minContains)));
    if (maxContains !== undefined) deps.push(MaxContains(...ofValueField(maxContains)));
    if (minItems !== undefined) deps.push(MinItems(...ofValueField(minItems)));
    if (maxItems !== undefined) deps.push(MaxItems(...ofValueField(maxItems)));
    if (uniqueItems) deps.push(UniqueItems(ofBoolField(uniqueItems)[1]));
    if (unevaluatedItems !== undefined) deps.push(UnevaluatedItems(unevaluatedItems));
    return FieldSchema<undefined>(options.type === false ? Dummy : IsArray, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: '.label should be an array',
    decode: ({ value }) => isArray(value),
    toJsonSchema: addType('array'),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined => {
      return hasType('array') ? IsArray() : void 0;
    },
  },
);

import { type AnyConstructor, Metadata } from '@kavri/basic';
import { IsArray } from './decorators/array.js';
import { Default, IsNullable, IsOptional } from './decorators/base.js';
import { IsBoolean } from './decorators/boolean.js';
import { IsEnum } from './decorators/enum.js';
import { IsInteger, IsNumber, ToBigInt } from './decorators/number.js';
import { IsMap, IsObject, Properties, Ref } from './decorators/object.js';
import { IsString } from './decorators/string.js';
import { DecodeResult, type DecodeContext } from './decode.js';
import {
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  isFieldSchemaDecorator,
  type NestedFieldSchema,
  Phase,
} from './field.js';
import { isArray, isFunction, isObject } from './utils.js';

/**
 * Create the default value for a schema class or an inline field schema.
 *
 * The default is selected from the field rules in this order:
 *
 * 1. explicit default rules,
 * 2. optional / nullable presence rules,
 * 3. enum first value,
 * 4. known type rules (`string`, `number`, `bigint`, `boolean`, object/ref,
 *    map, array, record),
 * 5. `undefined` for unknown rule sets.
 *
 * @param target - A `@Schema` class constructor, a single field decorator, or
 * an array of field decorators.
 * @returns A class instance or field value populated with the inferred default.
 *
 * @example
 * ```ts
 * @Schema()
 * class User {
 *   @IsString()
 *   name!: string;
 * }
 *
 * defaultOf(User).name; // ''
 * ```
 */
export function defaultOf<T>(target: AnyConstructor<T> | NestedFieldSchema): T {
  if (isFunction(target) && !isFieldSchemaDecorator(target)) {
    return defaultClass(target) as T;
  }
  return defaultRules(normalizeRules(target as NestedFieldSchema)) as T;
}

function defaultClass<T>(clazz: AnyConstructor<T>): T {
  const fields = Metadata.lookupField(FieldSchema, clazz);
  const out = Object.create(clazz.prototype) as Record<string, unknown>;
  if (!fields) {
    return out as T;
  }
  for (const [key, rules] of fields) {
    out[String(key)] = defaultRules(rules as readonly FieldSchemaDecoratorMetadata[]);
  }
  return out as T;
}

function defaultRules(rules: readonly FieldSchemaDecoratorMetadata[]): unknown {
  const explicit = explicitDefault(rules);
  if (explicit.found) return explicit.value;

  if (hasRule(rules, IsOptional)) return undefined;
  if (hasRule(rules, IsNullable)) return null;

  const enumRule = findRule(rules, IsEnum);
  if (enumRule) {
    const values = enumRule.params as { values?: readonly unknown[] };
    return values.values?.[0];
  }

  const refRule = findRule(rules, Ref);
  if (refRule) {
    return defaultClass((refRule.params as () => AnyConstructor)());
  }

  const mapRule = findRule(rules, IsMap);
  if (mapRule) {
    return new Map();
  }

  const objectRule = findRule(rules, IsObject);
  if (objectRule) {
    return defaultObjectFromProperties(rules);
  }

  if (hasRule(rules, IsArray)) return [];
  if (hasRule(rules, ToBigInt)) return 0n;
  if (hasRule(rules, IsString)) return '';
  if (hasRule(rules, IsNumber) || hasRule(rules, IsInteger)) return 0;
  if (hasRule(rules, IsBoolean)) return false;

  return undefined;
}

function explicitDefault(
  rules: readonly FieldSchemaDecoratorMetadata[],
): { found: true; value: unknown } | { found: false } {
  for (const rule of rules) {
    if (rule.factory.phase !== Phase.Defaults) {
      continue;
    }
    if (rule.factory === Default) {
      return { found: true, value: rule.params };
    }
    const decoded = decodeDefaultRule(rule);
    if (decoded.found) {
      return decoded;
    }
  }
  return { found: false };
}

function decodeDefaultRule(
  rule: FieldSchemaDecoratorMetadata,
): { found: true; value: unknown } | { found: false } {
  if (!rule.factory.decode) {
    return { found: true, value: rule.params };
  }
  let provided: unknown;
  const result = rule.factory.decode({
    value: undefined,
    originalValue: undefined,
    params: rule.params,
    currentRule: rule,
    provide: (value: unknown) => {
      provided = value;
      return new DecodeResult(true, value);
    },
  } as DecodeContext);

  if (result instanceof Promise) {
    return { found: false };
  }
  if (result instanceof DecodeResult && result.ok) {
    return { found: true, value: result.value };
  }
  if (provided !== undefined) {
    return { found: true, value: provided };
  }
  return { found: true, value: rule.params };
}

function defaultObjectFromProperties(rules: readonly FieldSchemaDecoratorMetadata[]): object {
  const out: Record<string, unknown> = {};
  for (const rule of rules) {
    if (rule.factory !== Properties || !isObject(rule.params)) {
      continue;
    }
    for (const [key, schema] of Object.entries(rule.params)) {
      if (schema !== undefined) {
        out[key] = defaultRules(normalizeRules(schema as NestedFieldSchema));
      }
    }
  }
  return out;
}

function normalizeRules(schema: NestedFieldSchema): readonly FieldSchemaDecoratorMetadata[] {
  const rules = isArray(schema) ? schema : [schema];
  const out: FieldSchemaDecoratorMetadata[] = [];
  for (const rule of rules) {
    if (isFieldSchemaDecorator(rule as FieldSchemaDecorator)) {
      out.push(...expandDecorator(rule as FieldSchemaDecorator));
    } else {
      out.push(rule as unknown as FieldSchemaDecoratorMetadata);
    }
  }
  return out;
}

function expandDecorator(decorator: FieldSchemaDecorator): readonly FieldSchemaDecoratorMetadata[] {
  class Inline {}
  decorator(Inline.prototype, 'value');
  return (Metadata.ofField(FieldSchema, Inline, 'value') ??
    []) as readonly FieldSchemaDecoratorMetadata[];
}

function hasRule(
  rules: readonly FieldSchemaDecoratorMetadata[],
  factory: FieldSchemaDecoratorMetadata['factory'],
): boolean {
  return findRule(rules, factory) !== undefined;
}

function findRule(
  rules: readonly FieldSchemaDecoratorMetadata[],
  factory: FieldSchemaDecoratorMetadata['factory'],
): FieldSchemaDecoratorMetadata | undefined {
  return rules.find((rule) => rule.factory === factory);
}

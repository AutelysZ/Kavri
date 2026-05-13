import { type AnyConstructor, Metadata } from '@kavri/basic';
import {
  DecoratorPhaseStrategy,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  isFieldSchemaDecorator,
  type NestedFieldSchema,
  Phase,
  type ProvidedDefault,
  ProvidedDefaultValue,
  Strategy,
} from './field.js';
import { isArray, isConstructor } from './utils.js';

/**
 * Create the default value for a schema class or an inline field schema.
 *
 * Defaults use the same phase order and phase strategy as decoding. Each
 * decorator may expose a `default(ctx)` static. Returning `undefined` means
 * "no default"; returning `ctx.provide(undefined)` explicitly provides
 * `undefined`.
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
  if (isConstructor(target) && !isFieldSchemaDecorator(target)) {
    return defaultClass(target) as T;
  }
  return defaultRules(normalizeRules(target)) as T;
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
  const groups = groupByPhase(rules);
  let hasDefault = false;
  let value: unknown;

  for (const [phase, phaseRules] of groups) {
    const strategy = DecoratorPhaseStrategy[phase];

    for (const rule of phaseRules) {
      const result = invokeDefault(rule);
      if (!result.found) {
        continue;
      }

      value = result.value;
      hasDefault = true;

      if (strategy === Strategy.ShortCircuit) {
        return value;
      }
      if (strategy === Strategy.AnyPass || strategy === Strategy.FailFast) {
        break;
      }
      if (strategy === Strategy.ContinueOnError) {
        break;
      }
    }
  }

  return hasDefault ? value : undefined;
}

function invokeDefault(
  rule: FieldSchemaDecoratorMetadata,
): { found: true; value: unknown } | { found: false } {
  if (!rule.factory.default) {
    return { found: false };
  }
  const result = rule.factory.default({
    params: rule.params,
    provide: (value) => ({ [ProvidedDefaultValue]: true, value }),
    defaultOf,
  });
  if (isProvidedDefault(result)) {
    return { found: true, value: result.value };
  }
  return result === undefined ? { found: false } : { found: true, value: result };
}

function isProvidedDefault(value: unknown): value is ProvidedDefault {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<typeof ProvidedDefaultValue, unknown>)[ProvidedDefaultValue] === true
  );
}

function groupByPhase(
  rules: readonly FieldSchemaDecoratorMetadata[],
): Array<[Phase, FieldSchemaDecoratorMetadata[]]> {
  const map = new Map<Phase, FieldSchemaDecoratorMetadata[]>();
  for (const rule of rules) {
    let bucket = map.get(rule.factory.phase);
    if (!bucket) {
      bucket = [];
      map.set(rule.factory.phase, bucket);
    }
    bucket.push(rule);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
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

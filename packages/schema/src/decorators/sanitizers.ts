/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sanitizer decorators: transform values during parse/serialize.
 * String sanitizers use tree-shakeable validator.js ES imports.
 * Type coercion decorators compose the target type as children.
 */
import trimFn from 'validator/es/lib/trim';
import ltrimFn from 'validator/es/lib/ltrim';
import rtrimFn from 'validator/es/lib/rtrim';
import escapeFn from 'validator/es/lib/escape';
import unescapeFn from 'validator/es/lib/unescape';
import stripLowFn from 'validator/es/lib/stripLow';
import blacklistFn from 'validator/es/lib/blacklist';
import whitelistFn from 'validator/es/lib/whitelist';
import normalizeEmailFn from 'validator/es/lib/normalizeEmail';
import type { NormalizeEmailOptions } from 'validator';

import type {
  BaseSchema,
  NumericSchema,
  SchemaFieldDecorator,
  SchemaFieldDecoratorFactoryStatic,
  StringSchema,
  ValidateSchema,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsBoolean, IsInteger, IsNumber, IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** No-param sanitizer: (schema?: StringSchema) => SchemaFieldDecorator */
type SS0 = ((schema?: StringSchema) => SchemaFieldDecorator<StringSchema>) &
  SchemaFieldDecoratorFactoryStatic<StringSchema>;

function ss0(rule: string, transform: (v: string) => string): SS0 {
  const factory = createSchemaFieldDecoratorFactory(
    (schema?: StringSchema): any => {
      return SchemaField(factory, (schema ?? {}) as any);
    },
    { rule, parse: (_: any, v: unknown) => (typeof v === 'string' ? transform(v) : v) },
  );
  return factory as any;
}

/** Required string param sanitizer: (chars: string, schema?) => SchemaFieldDecorator */
type SSR = ((
  chars: string,
  schema?: StringSchema,
) => SchemaFieldDecorator<ValidateSchema<string>>) &
  SchemaFieldDecoratorFactoryStatic<ValidateSchema<string>>;

function ssr(rule: string, transform: (v: string, chars: string) => string): SSR {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (chars: string, schema?: StringSchema): any => {
      return SchemaField(factory, { value: chars, ...(schema ?? {}) } as any);
    },
    { rule, parse: (p: any, v: unknown) => (typeof v === 'string' ? transform(v, p.value) : v) },
  );
  return factory as any;
}

// ---------------------------------------------------------------------------
// String sanitizers
// ---------------------------------------------------------------------------

/** Trim whitespace from both ends. */
export const Trim = ss0('Trim', (v) => trimFn(v));

/** Trim from left side. */
export const LTrim = ss0('LTrim', (v) => ltrimFn(v));

/** Trim from right side. */
export const RTrim = ss0('RTrim', (v) => rtrimFn(v));

/** Convert to lowercase. */
export const ToLowerCase = ss0('ToLowerCase', (v) => v.toLowerCase());

/** Convert to uppercase. */
export const ToUpperCase = ss0('ToUpperCase', (v) => v.toUpperCase());

/** HTML-escape: & < > " ' */
export const Escape = ss0('Escape', (v) => escapeFn(v));

/** Reverse HTML escaping. */
export const Unescape = ss0('Unescape', (v) => unescapeFn(v));

/** Strip characters with code < 32. */
export const StripLow = ss0('StripLow', (v) => stripLowFn(v));

/** Remove characters from the blacklist. */
export const Blacklist = ssr('Blacklist', (v, chars) => blacklistFn(v, chars));

/** Keep only characters in the whitelist. */
export const Whitelist = ssr('Whitelist', (v, chars) => whitelistFn(v, chars));

/** Normalize an email address. */
export const NormalizeEmail: ((
  options?: NormalizeEmailOptions,
  schema?: StringSchema,
) => SchemaFieldDecorator<NormalizeEmailOptions>) &
  SchemaFieldDecoratorFactoryStatic<NormalizeEmailOptions> = (() => {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (options?: NormalizeEmailOptions, schema?: StringSchema): any => {
      return SchemaField(factory, { ...(options ?? {}), ...(schema ?? {}) } as any);
    },
    {
      rule: 'NormalizeEmail',
      parse: (p: any, v: unknown) => (typeof v === 'string' ? normalizeEmailFn(v, p) || v : v),
    },
  );
  return factory;
})() as any;

// ---------------------------------------------------------------------------
// Type coercion sanitizers
// ---------------------------------------------------------------------------

/**
 * Coerce value to string. Adds IsString(schema) as child.
 * parse: `String(value)`
 */
export const ToString: ((schema?: StringSchema) => SchemaFieldDecorator<StringSchema>) &
  SchemaFieldDecoratorFactoryStatic<StringSchema> = (() => {
  const factory = createSchemaFieldDecoratorFactory(
    (schema?: StringSchema): any => {
      return SchemaField(factory, (schema ?? {}) as any, [IsString(schema)]);
    },
    {
      rule: 'ToString',
      parse: (_: any, v: unknown) => (v == null ? v : String(v)),
    },
  );
  return factory;
})() as any;

/**
 * Coerce string to number (float). Adds IsNumber(schema) as child.
 * Rejects strings that are not exact numeric representations (e.g., '1abc').
 * Uses `Number(value)` which returns NaN for non-numeric strings.
 */
export const ToNumber: ((schema?: NumericSchema) => SchemaFieldDecorator<NumericSchema>) &
  SchemaFieldDecoratorFactoryStatic<NumericSchema> = (() => {
  const factory = createSchemaFieldDecoratorFactory(
    (schema?: NumericSchema): any => {
      return SchemaField(factory, (schema ?? {}) as any, [IsNumber(schema)]);
    },
    {
      rule: 'ToNumber',
      parse: (_: any, v: unknown) => {
        if (typeof v !== 'string') return v;
        const n = Number(v);
        return Number.isFinite(n) ? n : v; // return original string if invalid — IsNumber child will reject
      },
    },
  );
  return factory;
})() as any;

/**
 * Coerce string to integer. Adds IsInteger(schema) as child.
 * Rejects strings that are not exact integer representations (e.g., '1abc', '1.5').
 * Uses `Number(value)` + `Number.isInteger()` check.
 */
export const ToInteger: ((schema?: NumericSchema) => SchemaFieldDecorator<NumericSchema>) &
  SchemaFieldDecoratorFactoryStatic<NumericSchema> = (() => {
  const factory = createSchemaFieldDecoratorFactory(
    (schema?: NumericSchema): any => {
      return SchemaField(factory, (schema ?? {}) as any, [IsInteger(schema)]);
    },
    {
      rule: 'ToInteger',
      parse: (_: any, v: unknown) => {
        if (typeof v !== 'string') return v;
        const n = Number(v);
        return Number.isInteger(n) ? n : v; // return original string if invalid — IsInteger child will reject
      },
    },
  );
  return factory;
})() as any;

/**
 * Coerce string/number to boolean. Adds IsBoolean(schema) as child.
 * parse: `'true'`/`'1'`/`1` → true, `'false'`/`'0'`/`0` → false
 */
export const ToBoolean: ((
  schema?: BaseSchema<boolean>,
) => SchemaFieldDecorator<BaseSchema<boolean>>) &
  SchemaFieldDecoratorFactoryStatic<BaseSchema<boolean>> = (() => {
  const factory = createSchemaFieldDecoratorFactory(
    (schema?: BaseSchema<boolean>): any => {
      return SchemaField(factory, (schema ?? {}) as any, [IsBoolean(schema)]);
    },
    {
      rule: 'ToBoolean',
      parse: (_: any, v: unknown) => {
        if (typeof v === 'string') {
          const lower = v.toLowerCase();
          if (lower === 'true' || lower === '1') return true;
          if (lower === 'false' || lower === '0') return false;
        }
        if (typeof v === 'number') return v !== 0;
        return v;
      },
    },
  );
  return factory;
})() as any;

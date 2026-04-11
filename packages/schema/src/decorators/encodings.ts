/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Encoding decorators: IsBase32, IsBase58, IsBase64, IsJSON.
 *
 * These are hybrid validators + sanitizers:
 * - transform=false: validate the string format only
 * - transform=true: decode on parse, encode on serialize
 * - text=true (with transform): decoded content is UTF-8 string
 * - text=false (with transform): decoded content is Uint8Array
 */
import isBase32Fn from 'validator/es/lib/isBase32';
import isBase58Fn from 'validator/es/lib/isBase58';
import isBase64Fn from 'validator/es/lib/isBase64';
import isJSONFn from 'validator/es/lib/isJSON';
import type {
  StringSchema,
  SchemaFieldDecorator,
  SchemaFieldDecoratorFactoryStatic,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Base32 encode/decode (RFC 4648)
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_HEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const BASE32_CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32Decode(input: string, alphabet: string): Uint8Array {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  const lookup = new Map(alphabet.split('').map((c, i) => [c, i]));
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = lookup.get(char);
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function base32Encode(data: Uint8Array, alphabet: string): string {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

function getBase32Alphabet(variant?: 'rfc4648' | 'hex' | 'crockford'): string {
  switch (variant) {
    case 'hex':
      return BASE32_HEX_ALPHABET;
    case 'crockford':
      return BASE32_CROCKFORD_ALPHABET;
    default:
      return BASE32_ALPHABET;
  }
}

// ---------------------------------------------------------------------------
// Base58 encode/decode (Bitcoin alphabet)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(input: string): Uint8Array {
  const lookup = new Map(BASE58_ALPHABET.split('').map((c, i) => [c, i]));
  let num = 0n;
  for (const char of input) {
    const idx = lookup.get(char);
    if (idx === undefined) return new Uint8Array(0);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  // Preserve leading zeros
  let leadingZeros = 0;
  for (const c of input) {
    if (c === '1') leadingZeros++;
    else break;
  }
  if (leadingZeros > 0) {
    const result = new Uint8Array(leadingZeros + bytes.length);
    result.set(bytes, leadingZeros);
    return result;
  }
  return bytes;
}

function base58Encode(data: Uint8Array): string {
  let num = 0n;
  for (const byte of data) {
    num = num * 256n + BigInt(byte);
  }
  let result = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    num = num / 58n;
  }
  // Preserve leading zeros
  for (const byte of data) {
    if (byte === 0) result = '1' + result;
    else break;
  }
  return result || '1';
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

function toUint8Array(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function fromUint8Array(data: Uint8Array, text: boolean): Uint8Array | string {
  return text ? new TextDecoder().decode(data) : data;
}

// ---------------------------------------------------------------------------
// Base64 encode/decode (browser + Node compatible via atob/btoa)
// ---------------------------------------------------------------------------

function base64Decode(input: string, urlSafe: boolean): Uint8Array {
  let str = urlSafe ? input.replace(/-/g, '+').replace(/_/g, '/') : input;
  // Add padding if needed
  while (str.length % 4 !== 0) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64Encode(data: Uint8Array, urlSafe: boolean, padding: boolean): string {
  let binary = '';
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  let result = btoa(binary);
  if (urlSafe) {
    result = result.replace(/\+/g, '-').replace(/\//g, '_');
  }
  if (!padding) {
    result = result.replace(/=+$/, '');
  }
  return result;
}

// ---------------------------------------------------------------------------
// IsBase32
// ---------------------------------------------------------------------------

export interface IsBase32Options {
  /** Base32 variant. Default: 'rfc4648'. */
  variant?: 'rfc4648' | 'hex' | 'crockford';
  /** Decode/encode the value. Default: false. */
  transform?: boolean;
  /** When transform=true, decode as UTF-8 string instead of Uint8Array. Default: false. */
  text?: boolean;
}

export const IsBase32: ((
  options?: IsBase32Options,
  schema?: StringSchema,
) => SchemaFieldDecorator<IsBase32Options>) &
  SchemaFieldDecoratorFactoryStatic<IsBase32Options> = (() => {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (options?: IsBase32Options, schema?: StringSchema): any => {
      return SchemaField(factory, { ...(options ?? {}), ...(schema ?? {}) } as any, undefined, [
        IsString(schema),
      ]);
    },
    {
      rule: 'IsBase32',
      validate: (p: IsBase32Options, v: unknown) =>
        typeof v !== 'string' || isBase32Fn(v, { crockford: p.variant === 'crockford' }),
      parse: (p: IsBase32Options, v: unknown) => {
        if (!p.transform || typeof v !== 'string') return v;
        const decoded = base32Decode(v, getBase32Alphabet(p.variant));
        return fromUint8Array(decoded, p.text ?? false);
      },
      serialize: (p: IsBase32Options, v: unknown) => {
        if (!p.transform) return v;
        return base32Encode(toUint8Array(v as Uint8Array | string), getBase32Alphabet(p.variant));
      },
      toJsonSchema: () => ({ type: 'string', contentEncoding: 'base32' }),
    },
  );
  return factory;
})() as any;

// ---------------------------------------------------------------------------
// IsBase58
// ---------------------------------------------------------------------------

export interface IsBase58Options {
  /** Decode/encode the value. Default: false. */
  transform?: boolean;
  /** When transform=true, decode as UTF-8 string instead of Uint8Array. Default: false. */
  text?: boolean;
}

export const IsBase58: ((
  options?: IsBase58Options,
  schema?: StringSchema,
) => SchemaFieldDecorator<IsBase58Options>) &
  SchemaFieldDecoratorFactoryStatic<IsBase58Options> = (() => {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (options?: IsBase58Options, schema?: StringSchema): any => {
      return SchemaField(factory, { ...(options ?? {}), ...(schema ?? {}) } as any, undefined, [
        IsString(schema),
      ]);
    },
    {
      rule: 'IsBase58',
      validate: (_: IsBase58Options, v: unknown) => typeof v !== 'string' || isBase58Fn(v),
      parse: (p: IsBase58Options, v: unknown) => {
        if (!p.transform || typeof v !== 'string') return v;
        const decoded = base58Decode(v);
        return fromUint8Array(decoded, p.text ?? false);
      },
      serialize: (p: IsBase58Options, v: unknown) => {
        if (!p.transform) return v;
        return base58Encode(toUint8Array(v as Uint8Array | string));
      },
      toJsonSchema: () => ({ type: 'string', contentEncoding: 'base58' }),
    },
  );
  return factory;
})() as any;

// ---------------------------------------------------------------------------
// IsBase64
// ---------------------------------------------------------------------------

export interface IsBase64Options {
  /** Use URL-safe alphabet (no + / =). Default: true. */
  urlSafe?: boolean;
  /** Require padding (=). Default: false. */
  padding?: boolean;
  /** Decode/encode the value. Default: true. */
  transform?: boolean;
  /** When transform=true, decode as UTF-8 string instead of Uint8Array. Default: false. */
  text?: boolean;
}

export const IsBase64: ((
  options?: IsBase64Options,
  schema?: StringSchema,
) => SchemaFieldDecorator<IsBase64Options>) &
  SchemaFieldDecoratorFactoryStatic<IsBase64Options> = (() => {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (options?: IsBase64Options, schema?: StringSchema): any => {
      return SchemaField(factory, { ...(options ?? {}), ...(schema ?? {}) } as any, undefined, [
        IsString(schema),
      ]);
    },
    {
      rule: 'IsBase64',
      validate: (p: IsBase64Options, v: unknown) =>
        typeof v !== 'string' || isBase64Fn(v, { urlSafe: p.urlSafe ?? true }),
      parse: (p: IsBase64Options, v: unknown) => {
        if (!(p.transform ?? true) || typeof v !== 'string') return v;
        const decoded = base64Decode(v, p.urlSafe ?? true);
        return fromUint8Array(decoded, p.text ?? false);
      },
      serialize: (p: IsBase64Options, v: unknown) => {
        if (!(p.transform ?? true)) return v;
        return base64Encode(
          toUint8Array(v as Uint8Array | string),
          p.urlSafe ?? true,
          p.padding ?? false,
        );
      },
      toJsonSchema: (p: IsBase64Options) => ({
        type: 'string',
        contentEncoding: (p.urlSafe ?? true) ? 'base64url' : 'base64',
      }),
    },
  );
  return factory;
})() as any;

// ---------------------------------------------------------------------------
// IsJSON
// ---------------------------------------------------------------------------

export interface IsJSONOptions {
  /** Parse/stringify the value. Default: true. */
  transform?: boolean;
}

export const IsJSON: ((
  options?: IsJSONOptions,
  schema?: StringSchema,
) => SchemaFieldDecorator<IsJSONOptions>) &
  SchemaFieldDecoratorFactoryStatic<IsJSONOptions> = (() => {
  const factory = createSchemaFieldDecoratorFactory<any>(
    (options?: IsJSONOptions, schema?: StringSchema): any => {
      return SchemaField(factory, { ...(options ?? {}), ...(schema ?? {}) } as any, undefined, [
        IsString(schema),
      ]);
    },
    {
      rule: 'IsJSON',
      validate: (_: IsJSONOptions, v: unknown) => typeof v !== 'string' || isJSONFn(v),
      parse: (p: IsJSONOptions, v: unknown) => {
        if (!(p.transform ?? true) || typeof v !== 'string') return v;
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      },
      serialize: (p: IsJSONOptions, v: unknown) => {
        if (!(p.transform ?? true)) return v;
        if (typeof v === 'string') return v;
        return JSON.stringify(v);
      },
      toJsonSchema: () => ({
        type: 'string',
        contentMediaType: 'application/json',
        // contentSchema generated by toJsonSchema utility from sibling decorators
      }),
    },
  );
  return factory;
})() as any;

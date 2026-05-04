/*
 * Text encoding decorators: `IsBase32`, `IsBase58`, `IsBase64`.
 *
 * Each is a Phase.TextEncoding decorator that:
 * - validates the input string belongs to the encoding's alphabet,
 * - decodes the string to bytes (`Uint8Array`) and `provide`s the result,
 * - encodes back to the canonical string form during `encode`.
 *
 * Set `text: true` to receive the decoded bytes as a UTF-8 string instead of
 * `Uint8Array`. There is no `transform` option — decoding is always applied.
 */

import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
} from '../field.js';
import { isString } from '../utils.js';
import { IsString, type StringOptions } from './string.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_HEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const BASE32_CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type Base32Variant = 'rfc4648' | 'hex' | 'crockford';

function getBase32Alphabet(variant?: Base32Variant): string {
  switch (variant) {
    case 'hex':
      return BASE32_HEX_ALPHABET;
    case 'crockford':
      return BASE32_CROCKFORD_ALPHABET;
    default:
      return BASE32_ALPHABET;
  }
}

function base32Decode(input: string, alphabet: string): Uint8Array | null {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  const lookup = new Map(alphabet.split('').map((c, i) => [c, i]));
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = lookup.get(char);
    if (idx === undefined) return null;
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

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(input: string): Uint8Array | null {
  if (input === '') return new Uint8Array(0);
  const lookup = new Map(BASE58_ALPHABET.split('').map((c, i) => [c, i]));
  let num = 0n;
  for (const char of input) {
    const idx = lookup.get(char);
    if (idx === undefined) return null;
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(2, '0');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
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
  for (const byte of data) {
    if (byte === 0) result = '1' + result;
    else break;
  }
  return result || '1';
}

function base64Decode(input: string, urlSafe: boolean): Uint8Array | null {
  let str = urlSafe ? input.replace(/-/g, '+').replace(/_/g, '/') : input;
  while (str.length % 4 !== 0) str += '=';
  let binary: string;
  try {
    binary = atob(str);
  } catch {
    return null;
  }
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

function toUint8Array(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function fromUint8Array(data: Uint8Array, text: boolean): Uint8Array | string {
  return text ? new TextDecoder().decode(data) : data;
}

export interface IsBase32Options {
  /**
   * Base32 variant. Default: `'rfc4648'`.
   */
  variant?: Base32Variant;
  /**
   * Decode bytes to a UTF-8 string instead of `Uint8Array`. Default: `false`.
   */
  text?: boolean;
}

/**
 * Validate and decode a base32-encoded string. `decode` provides the decoded
 * bytes (`Uint8Array`, or UTF-8 string when `text: true`); `encode` re-encodes
 * back to the canonical base32 form.
 *
 * Maps to JSON Schema `{ contentEncoding: 'base32' }`.
 */
export const IsBase32 = createFieldSchemaDecoratorFactory(
  'IsBase32',
  (
    options: IsBase32Options = {},
    schema: StringOptions = {},
  ): FieldSchemaDecorator<IsBase32Options> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<IsBase32Options>(IsBase32, options, opts, [IsString(info)]);
  },
  {
    phase: Phase.TextEncoding,
    message: '.label must be a valid base32 string',
    decode: ({ value, params: { variant, text = false }, provide }) => {
      if (!isString(value)) return true;
      const decoded = base32Decode(value, getBase32Alphabet(variant));
      if (decoded === null) return false;
      return provide(fromUint8Array(decoded, text));
    },
    encode: ({ variant }, value) => {
      if (!isString(value) && !(value instanceof Uint8Array)) return value;
      return base32Encode(toUint8Array(value), getBase32Alphabet(variant));
    },
    toJsonSchema: () => ({ contentEncoding: 'base32' }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.contentEncoding === 'base32' ? IsBase32() : void 0;
    },
  },
);

export interface IsBase58Options {
  /**
   * Decode bytes to a UTF-8 string instead of `Uint8Array`. Default: `false`.
   */
  text?: boolean;
}

/**
 * Validate and decode a base58-encoded string (Bitcoin alphabet). `decode`
 * provides the decoded bytes; `encode` re-encodes back.
 *
 * Maps to JSON Schema `{ contentEncoding: 'base58' }`.
 */
export const IsBase58 = createFieldSchemaDecoratorFactory(
  'IsBase58',
  (
    options: IsBase58Options = {},
    schema: StringOptions = {},
  ): FieldSchemaDecorator<IsBase58Options> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<IsBase58Options>(IsBase58, options, opts, [IsString(info)]);
  },
  {
    phase: Phase.TextEncoding,
    message: '.label must be a valid base58 string',
    decode: ({ value, params: { text = false }, provide }) => {
      if (!isString(value)) return true;
      const decoded = base58Decode(value);
      if (decoded === null) return false;
      return provide(fromUint8Array(decoded, text));
    },
    encode: (_, value) => {
      if (!isString(value) && !(value instanceof Uint8Array)) return value;
      return base58Encode(toUint8Array(value));
    },
    toJsonSchema: () => ({ contentEncoding: 'base58' }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.contentEncoding === 'base58' ? IsBase58() : void 0;
    },
  },
);

export interface IsBase64Options {
  /**
   * Use URL-safe alphabet (`-_` instead of `+/`). Default: `true`.
   */
  urlSafe?: boolean;
  /**
   * Require / emit `=` padding. Default: `false`.
   */
  padding?: boolean;
  /**
   * Decode bytes to a UTF-8 string instead of `Uint8Array`. Default: `false`.
   */
  text?: boolean;
}

/**
 * Validate and decode a base64-encoded string. `decode` provides the decoded
 * bytes (`Uint8Array`, or UTF-8 string when `text: true`); `encode` re-encodes
 * back to the canonical form using the same `urlSafe` / `padding` settings.
 *
 * Maps to JSON Schema `{ contentEncoding: 'base64url' }` (when `urlSafe`) or
 * `{ contentEncoding: 'base64' }`.
 */
export const IsBase64 = createFieldSchemaDecoratorFactory(
  'IsBase64',
  (
    options: IsBase64Options = {},
    schema: StringOptions = {},
  ): FieldSchemaDecorator<IsBase64Options> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<IsBase64Options>(IsBase64, options, opts, [IsString(info)]);
  },
  {
    phase: Phase.TextEncoding,
    message: '.label must be a valid base64 string',
    decode: ({ value, params: { urlSafe = true, text = false }, provide }) => {
      if (!isString(value)) return true;
      const decoded = base64Decode(value, urlSafe);
      if (decoded === null) return false;
      return provide(fromUint8Array(decoded, text));
    },
    encode: ({ urlSafe = true, padding = false }, value) => {
      if (!isString(value) && !(value instanceof Uint8Array)) return value;
      return base64Encode(toUint8Array(value), urlSafe, padding);
    },
    toJsonSchema: ({ urlSafe = true }) => ({
      contentEncoding: urlSafe ? 'base64url' : 'base64',
    }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      if (schema.contentEncoding === 'base64url') return IsBase64({ urlSafe: true });
      if (schema.contentEncoding === 'base64') return IsBase64({ urlSafe: false });
      return void 0;
    },
  },
);

import type { DecodeContext } from '../decode.js';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
  type ValidateOptions,
} from '../field.js';
import { isString } from '../utils.js';

/**
 * Options for `IsCompressed`.
 */
export interface IsCompressedOptions {
  /**
   * Compression format. Default: `'gzip'`.
   */
  format?: CompressionFormat;
  /**
   * Decode bytes to a UTF-8 string instead of `Uint8Array`. Default: `false`.
   */
  text?: boolean;
}

/**
 * Wrap a `Uint8Array` in a one-shot `ReadableStream` for piping.
 */
function bytesAsStream(input: Uint8Array): ReadableStream<BufferSource> {
  return new Blob([input as Uint8Array<ArrayBuffer>]).stream();
}

/**
 * Pump bytes through a `DecompressionStream` and gather the result.
 */
async function decompress(input: Uint8Array, format: CompressionFormat, text?: boolean) {
  const stream = bytesAsStream(input).pipeThrough(new DecompressionStream(format));
  const response = new Response(stream);
  return text ? response.text() : new Uint8Array(await response.arrayBuffer());
}

/**
 * Pump bytes through a `CompressionStream` and gather the result.
 */
async function compress(input: Uint8Array, format: CompressionFormat) {
  const stream = bytesAsStream(input).pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toUint8Array(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

/**
 * Validate and decompress a `Uint8Array` payload using the platform-native
 * `DecompressionStream` (`'gzip'`, `'deflate'`, `'deflate-raw'`). `decode`
 * provides the decompressed bytes (`Uint8Array`, or UTF-8 string when
 * `text: true`); `encode` re-compresses via `CompressionStream`.
 *
 * Runs in `Phase.BinaryEncoding`, so it composes naturally after a text
 * encoding decorator like `IsBase64` (`'base64'` string → bytes → decompressed
 * bytes / text). The JSON Schema `contentEncoding` is appended with `'+'`
 * to any encoding emitted by sibling decorators (e.g. `'base64+gzip'`).
 *
 * `decode` and `encode` are async — `DecompressionStream`/`CompressionStream`
 * are stream APIs with no synchronous variant.
 */
export const IsCompressed = createFieldSchemaDecoratorFactory(
  'IsCompressed',
  (
    options: IsCompressedOptions = {},
    schema: ValidateOptions = {},
  ): FieldSchemaDecorator<IsCompressedOptions> => {
    return FieldSchema<IsCompressedOptions>(IsCompressed, options, schema);
  },
  {
    phase: Phase.BinaryEncoding,
    message: '.label is not valid compressed data',
    decode: async ({ value, params, provide }: DecodeContext<IsCompressedOptions>) => {
      if (!(value instanceof Uint8Array)) return true;
      return provide(decompress(value, params.format ?? 'gzip', params.text));
    },
    encode: async ({ params, value }) => {
      if (!isString(value) && !(value instanceof Uint8Array)) return value;
      return await compress(toUint8Array(value), params.format ?? 'gzip');
    },
    toJsonSchema: ({ params: { format = 'gzip' }, current }) => ({
      contentEncoding: current.contentEncoding ? `${current.contentEncoding}+${format}` : format,
    }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      const encs = schema.contentEncoding?.split('+') ?? [];
      const candidates: CompressionFormat[] = ['gzip', 'deflate', 'deflate-raw'];
      const format = candidates.find((f) => encs.includes(f));
      return format ? IsCompressed({ format }) : void 0;
    },
  },
);

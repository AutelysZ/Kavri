import { createFieldDecorator, type FieldDecorator } from '@kavri/basic';
import {
  type BinaryHandler,
  type BinaryUnions,
  type FileHandler,
  type FileUnions as EnvFileUnions,
  registerBinaryHandlers,
  registerFileHandlers,
} from '@kavri/env';
import db from 'mime-db';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  ofArrayField,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { Schema } from '../schema.js';
import { createUnionClass } from '../union.js';
import { entryOf, isString, once } from '../utils.js';
import { type ArrayOptions, IsArray } from './array.js';
import { IsInteger } from './number.js';
import { IsInstanceOf } from './object.js';
import { IsString, type StringOptions } from './string.js';
import { IsMimeType } from './string.semantics.js';

const mimeDB = once(() => {
  const out: Record<string, readonly string[]> = {};
  for (const [k, v] of entryOf(db)) {
    if (!v.extensions) {
      continue;
    }
    out[k] = v.extensions;
    const allType = k.substring(0, k.indexOf('/') + 1) + '*';
    ((out[allType] ??= []) as string[]).push(...v.extensions);
  }
  return out;
});

export interface AcceptSchema {
  accept: string[];
  extensions: Set<string>;
}

export const Accept = createFieldSchemaDecoratorFactory(
  'Accept',
  (accept: string[], options?: ValidateOptions): FieldSchemaDecorator<AcceptSchema> => {
    const extensions = new Set(
      accept.flatMap((item) => {
        if (item.startsWith('.')) {
          return [item.toLowerCase()];
        }
        const mime = mimeDB()[item];
        if (!mime) {
          throw new Error(`Invalid mime/extension "${item}" found.`);
        }
        return mime;
      }),
    );
    return FieldSchema<AcceptSchema>(Accept, { accept, extensions }, options);
  },
  {
    phase: Phase.Semantics,
    message: ({ params }) => `.label should be a: ${params.accept.join(', ')}.`,
    decode: ({ value, params: { extensions } }) => {
      let name: string;
      if (isString(value)) {
        name = value.toLowerCase();
      } else if (value instanceof FileUnion) {
        name = value.toHandle().name.toLowerCase();
      } else {
        return true;
      }
      for (const e of extensions) {
        if (name.endsWith(e)) {
          return true;
        }
      }
      return false;
    },
  },
);

export const MaxSize = createFieldSchemaDecoratorFactory(
  'MaxSize',
  (size: number, options: ValidateOptions = {}): FieldSchemaDecorator<number> => {
    return FieldSchema<number>(MaxSize, size, options);
  },
  {
    phase: Phase.Semantics,
    message: 'The size of .label cannot exceed .params',
    decode: ({ params, value }) => !FileUnion.is(value) || value.toHandle().size <= params,
  },
);

export type FilenameType = 'name_only' | 'nested' | 'absolute' | 'relative';

export interface IsFilenameOptions {
  /**
   * - name_only: only allow filename, no special chars like /
   * - nested: allow dir, like a/b.png, but no /, and no ../ or ./
   * - absolute: must be like /a/b/c.png
   * - relative: all name, nested, absolute style, and also allow ./ and ../
   * default is name_only
   */
  type?: FilenameType;
  /**
   * Accepted file extensions or MIME patterns. E.g., ['.png', '.jpg', 'image/*'].
   */
  accept?: ValidateField<string[]>;
}

/**
 * Marks a field as a filename for binary uploads.
 * Validates against accept patterns if provided.
 * Use in binary request schemas alongside @IsBody.
 */
export const IsFilename = createFieldSchemaDecoratorFactory(
  'IsFilename',
  (
    { type = 'name_only', accept }: IsFilenameOptions = {},
    schema: StringOptions = {},
  ): FieldSchemaDecorator<FilenameType> => {
    const [opts, info] = decoupleOptions(schema);
    const deps: FieldSchemaDecorator[] = [IsString(info)];
    if (accept) deps.push(Accept(...ofArrayField(accept)));
    return FieldSchema<FilenameType>(IsFilename, type, opts, deps);
  },
  {
    phase: Phase.Semantics,
    message: '.label should be a filename',
    decode: ({ value, params }) => {
      if (!isString(value)) return true;
      if (value === '' || value.includes('\0')) return false;

      const segs = value.split('/');
      const startsAbs = value.startsWith('/');
      const trailing = value.length > 1 && value.endsWith('/');

      switch (params) {
        case 'name_only':
          return !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..';
        case 'nested':
          return !startsAbs && !trailing && segs.every((s) => s !== '' && s !== '.' && s !== '..');
        case 'absolute': {
          if (!startsAbs || trailing) return false;
          const parts = segs.slice(1);
          return parts.length > 0 && parts.every((s) => s !== '' && s !== '.' && s !== '..');
        }
        case 'relative': {
          if (trailing) return false;
          const parts = startsAbs ? segs.slice(1) : segs;
          return parts.length > 0 && parts.every((s) => s !== '');
        }
      }
    },
  },
);

/**
 * Represents an uploaded file in a multipart request.
 */
@Schema()
export class MultipartFile {
  /**
   * Original uploaded filename.
   */
  @IsString()
  readonly name!: string;
  /**
   * File size in bytes.
   */
  @IsInteger()
  readonly size!: number;
  /**
   * MIME type.
   */
  @IsMimeType()
  readonly type!: string;
  /**
   * Temp file path on disk.
   */
  @IsFilename({ type: 'absolute' })
  readonly path!: string;
}

export interface FileUnions extends EnvFileUnions {
  multipart: MultipartFile;
}

export class FileUnion extends createUnionClass<FileUnions, FileHandler>('FileUnion', (ctor) => {
  ctor.register('multipart', (v) => ({ name: v.name, size: v.size }));
  registerFileHandlers(ctor.register.bind(ctor));
}) {}

/**
 * Options for file upload fields.
 */
export interface IsFileOptions {
  /**
   * If true, field type is MultipartFile[]. Default: false.
   */
  array?: ArrayOptions<FileUnion>;
  /**
   * Accepted MIME utils. E.g., ['image/*', 'application/pdf'].
   */
  accept?: ValidateField<string[]>;
  /**
   * Max file size in bytes.
   */
  maxSize?: ValidateField<number>;
}

/**
 * Marks a field as a file upload. Use in multipart request schemas only.
 * Composes Ref(() => MultipartFile) or IsArray(Ref(() => MultipartFile)) as dep.
 * Can combine with other decorators like @MaxItems for array uploads.
 *
 * Validates:
 * - `accept`: checks file MIME type against allowed patterns (glob-style).
 * - `maxSize`: checks file size in bytes.
 */

export function IsFile(options?: IsFileOptions, schema?: ValidateOptions): FieldDecorator<void> {
  const { array, accept, maxSize } = options ?? {};
  const deps: FieldSchemaDecorator[] = [IsInstanceOf(FileUnion, schema)];
  if (accept) deps.push(Accept(...ofArrayField(accept)));
  if (maxSize) deps.push(MaxSize(...ofValueField(maxSize)));
  return createFieldDecorator(IsFile, void 0, { self: array ? [IsArray(deps, array)] : deps });
}

export class BinaryUnion extends createUnionClass<BinaryUnions, BinaryHandler>(
  'BinaryUnion',
  (ctor) => {
    registerBinaryHandlers(ctor.register.bind(ctor));
  },
) {}

/**
 * Check a field is a {@link BinaryUnion}
 * @param options
 * @constructor
 */
export function IsBinary(options?: ValidateOptions) {
  return IsInstanceOf(BinaryUnion, options);
}

/**
 * Mark a field comes from entire body.
 *
 * All {@link IsFile}, {@link RawBody}, {@link InQuery} and {@link InHeader} are not
 * {@link FieldSchemaDecoratorFactory}, they can only apply to the field directly.
 *
 * The affect:
 *
 * 1. How {@link toOpenAPIv3} generate OpenAPI schema
 * 2. How {@link ResolveInterceptor} merge the parts of incoming data
 * 3. If {@link MultipartParseInterceptor} is involved (via {@link IsFile})
 */
export function RawBody(): FieldDecorator<void> {
  return createFieldDecorator(RawBody, void 0);
}

/**
 * Mark a field comes from query, can specify a different name of the source.
 *
 * Note: there is no `InBody` method to mark a field comes from body. By default,
 * if an HTTP method can accept body, body has high priority than query. InQuery
 * means the field must come from query, to override the priority rule.
 *
 * It will provide:
 * - undefined: If there is no such a header
 * - string: if there is only one value of the header
 * - string[]: if there are multiple values of the header
 *
 * You need to use this with constraints to ensure it fit your requirements.
 */
export function InQuery(name?: string): FieldDecorator<string | undefined> {
  return createFieldDecorator(InQuery, name);
}

/**
 * Mark a field comes from header. By default, header doesn't be involved when
 * resolve request. Only if some fields used it explicitly.
 *
 * It will provide:
 * - undefined: If there is no such a header
 * - string: if there is only one value of the header
 * - string[]: if there are multiple values of the header
 *
 * You need to use this with constraints to ensure it fit your requirements.
 */
export function InHeader(name: string): FieldDecorator<string> {
  return createFieldDecorator(InHeader, name);
}

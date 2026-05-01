import { type BinaryHandler, Env, type FileHandler } from '@kavri/env';
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
import { IsString, type StringOptions } from './string.js';
import { IsMimeType } from './string.semantics.js';

const mimeDB = /* #__PURE__ */ once(() => {
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
          return (
            !value.includes('/') &&
            !value.includes('\\') &&
            value !== '.' &&
            value !== '..'
          );
        case 'nested':
          return (
            !startsAbs &&
            !trailing &&
            segs.every((s) => s !== '' && s !== '.' && s !== '..')
          );
        case 'absolute': {
          if (!startsAbs || trailing) return false;
          const parts = segs.slice(1);
          return (
            parts.length > 0 && parts.every((s) => s !== '' && s !== '.' && s !== '..')
          );
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

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Kavri {
    interface FileUnions {
      multipart: MultipartFile;
    }
  }
}

/** Represents an uploaded file in a multipart request. */
@Schema()
export class MultipartFile {
  /** Original uploaded filename. */
  @IsString()
  readonly name!: string;
  /** File size in bytes. */
  @IsInteger()
  readonly size!: number;
  /** MIME type. */
  @IsMimeType()
  readonly type!: string;
  /** Temp file path on disk. */
  @IsFilename({ type: 'absolute' })
  readonly path!: string;
}

export class FileUnion
  extends /* @__PURE__ */ createUnionClass<Kavri.FileUnions, FileHandler>('FileUnion', (ctor) => {
    ctor.register('multipart', (v) => ({ name: v.name, size: v.size }));
    Env.registerFileHandlers(ctor.register.bind(ctor));
  }) {}

/** Options for file upload fields. */
export interface IsFileOptions {
  /** If true, field type is MultipartFile[]. Default: false. */
  array?: ArrayOptions<FileUnion>;
  /** Accepted MIME utils. E.g., ['image/*', 'application/pdf']. */
  accept?: ValidateField<string[]>;
  /** Max file size in bytes. */
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
export const IsFile = createFieldSchemaDecoratorFactory(
  'IsFile',
  (
    { array, accept, maxSize }: IsFileOptions = {},
    options: ValidateOptions = {},
  ): FieldSchemaDecorator<boolean> => {
    const deps: FieldSchemaDecorator[] = [];
    if (array) deps.push(IsArray(IsFile({ accept, maxSize }), array));
    else {
      if (accept) deps.push(Accept(...ofArrayField(accept)));
      if (maxSize) deps.push(MaxSize(...ofValueField(maxSize)));
    }
    return FieldSchema<boolean>(IsFile, !array, options, deps);
  },
  {
    phase: Phase.Type,
    message: '.label should be a file.',
    decode: ({ value, params }) => !params || FileUnion.is(value),
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

// ---------------------------------------------------------------------------
// IsBody
// ---------------------------------------------------------------------------

export class BinaryUnion
  extends /* @__PURE__ */ createUnionClass<Kavri.BinaryUnions, BinaryHandler>(
    'BinaryUnion',
    (ctor) => {
      Env.registerBinaryHandlers(ctor.register.bind(ctor));
    },
  ) {}

/**
 * Marks a field as the raw binary request body stream.
 * Use in binary request schemas only. At most one @IsBinary per schema.
 */
export const IsBinary = createFieldSchemaDecoratorFactory(
  'IsBinary',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsBinary, void 0, options);
  },
  {
    phase: Phase.Type,
    message: '.label should be a binary stream',
    decode: ({ value }) => BinaryUnion.is(value),
  },
);

/**
 * Mark a field MUST be the entire body and as a binary data.
 */
export const IsBody = createFieldSchemaDecoratorFactory(
  'IsBody',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsBody, void 0, options, [IsBinary(options)]);
  },
  {
    phase: Phase.Info,
    message: '',
  },
);

/**
 * Just mark a field MUST in query
 */
export const IsQuery = createFieldSchemaDecoratorFactory(
  'IsQuery',
  (): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsQuery, void 0, void 0);
  },
  {
    phase: Phase.Info,
    message: '',
  },
);

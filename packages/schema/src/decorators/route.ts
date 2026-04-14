/**
 * Route-specific field decorators: IsFile, IsBody, IsFilename.
 * These are exclusive to route request schemas.
 */
import { lookup } from 'mime-types';
import type { BaseSchema, SchemaFieldDecorator, StringSchema, ValidateOptions } from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsInteger, IsString } from './primitives.js';
import { IsArray, Ref } from './composite.js';
import { Schema } from '../schema';
import { IsMimeType } from './validators';

// ---------------------------------------------------------------------------
// IsFilename
// ---------------------------------------------------------------------------

/** Options for filename fields. */
export interface IsFilenameOptions extends ValidateOptions {
  /**
   * - name_only: only allow filename, no special chars like /
   * - nested: allow dir, like a/b.png, but no /, and no ../ or ./
   * - absolute: must be like /a/b/c.png
   * - relative: all name, nested, absolute style, and also allow ./ and ../
   * default is name_only
   */
  type?: 'name_only' | 'nested' | 'absolute' | 'relative';
  /** Accepted file extensions or MIME patterns. E.g., ['.png', '.jpg', 'image/*']. */
  accept?: string[];
}

/**
 * Marks a field as a filename for binary uploads.
 * Validates against accept patterns if provided.
 * Use in binary request schemas alongside @IsBody.
 */
export const IsFilename = createSchemaFieldDecoratorFactory(
  'IsFilename',
  (
    options: IsFilenameOptions = {},
    schema?: StringSchema,
  ): SchemaFieldDecorator<IsFilenameOptions> => {
    return SchemaField(IsFilename, options, undefined, [IsString(schema)]);
  },
  {
    message: '.label should be a filename',
    validate: (p, v) => {
      if (typeof v !== 'string' || !p.accept?.length) return true;
      const mimeType = lookup(v) || '';
      return p.accept.some((pattern: string) => {
        if (pattern.startsWith('.')) return v.endsWith(pattern);
        return matchAccept([pattern], mimeType);
      });
    },
  },
);

// ---------------------------------------------------------------------------
// MultipartFile
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// IsFile
// ---------------------------------------------------------------------------

/** Options for file upload fields. */
export interface IsFileOptions extends ValidateOptions {
  /** If true, field type is MultipartFile[]. Default: false. */
  array?: boolean;
  /** Accepted MIME types. E.g., ['image/*', 'application/pdf']. */
  accept?: string[];
  /** Max file size in bytes. */
  maxSize?: number;
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
export const IsFile = createSchemaFieldDecoratorFactory(
  'IsFile',
  (options?: IsFileOptions): SchemaFieldDecorator<IsFileOptions> => {
    const fileRef = Ref(() => MultipartFile);
    const dep = options?.array ? IsArray(fileRef) : fileRef;
    return SchemaField(IsFile, (options ?? {}) as IsFileOptions, undefined, [dep]);
  },
  {
    message: '.label should be a file',
    validate: (p, v) => {
      if (v == null) return true; // handled by required/optional
      const files: MultipartFile[] = Array.isArray(v) ? v : [v];
      for (const file of files) {
        if (!(file instanceof MultipartFile)) return false;
        if (p.maxSize !== undefined && file.size > p.maxSize) return false;
        if (p.accept?.length && !matchAccept(p.accept, file.type)) return false;
      }
      return true;
    },
  },
);

/** Check if a MIME type matches any of the accept patterns. */
function matchAccept(accept: string[], mimeType: string): boolean {
  return accept.some((pattern) => {
    if (pattern === mimeType) return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // 'image/*' → 'image/'
      return mimeType.startsWith(prefix);
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// IsBody
// ---------------------------------------------------------------------------

/**
 * Marks a field as the raw binary request body stream.
 * Use in binary request schemas only. At most one @IsBody per schema.
 */
export const IsBody = createSchemaFieldDecoratorFactory(
  'IsBody',
  (schema?: BaseSchema<ReadableStream>): SchemaFieldDecorator<BaseSchema<ReadableStream>> => {
    return SchemaField(IsBody, (schema ?? {}) as BaseSchema<ReadableStream>);
  },
  {
    message: '.label should be a stream/blob/buffer',
  },
);

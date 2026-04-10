/**
 * Route-specific field decorators: IsFile, IsBody, IsFilename.
 * These are exclusive to route request schemas.
 */
import type { StringSchema, ValidateOptions, SchemaFieldDecorator } from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

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
 * Do NOT combine with other schema decorators.
 */
export const IsFile = createSchemaFieldDecoratorFactory(
  (options?: IsFileOptions): SchemaFieldDecorator<IsFileOptions> => {
    return SchemaField(IsFile, (options ?? {}) as IsFileOptions);
  },
  {
    rule: 'IsFile',
    // File validation handled by the multipart parser, not the schema validator
  },
);

// ---------------------------------------------------------------------------
// IsBody
// ---------------------------------------------------------------------------

/**
 * Marks a field as the raw binary request body stream.
 * Use in binary request schemas only. At most one @IsBody per schema.
 * Do NOT combine with other schema decorators.
 */
export const IsBody = createSchemaFieldDecoratorFactory(
  (options?: ValidateOptions): SchemaFieldDecorator<ValidateOptions> => {
    return SchemaField(IsBody, (options ?? {}) as ValidateOptions);
  },
  {
    rule: 'IsBody',
    // Body validation handled by the binary parser, not the schema validator
  },
);

// ---------------------------------------------------------------------------
// IsFilename
// ---------------------------------------------------------------------------

/** Options for filename fields. */
export interface IsFilenameOptions extends ValidateOptions {
  /** Accepted file extensions or MIME patterns. E.g., ['.png', '.jpg', 'image/*']. */
  accept?: string[];
}

/**
 * Marks a field as a filename for binary uploads.
 * Validates against accept patterns if provided.
 * Use in binary request schemas alongside @IsBody.
 */
export const IsFilename = createSchemaFieldDecoratorFactory(
  (options?: IsFilenameOptions, schema?: StringSchema): SchemaFieldDecorator<IsFilenameOptions> => {
    return SchemaField(IsFilename, (options ?? {}) as IsFilenameOptions, undefined, [
      IsString(schema),
    ]);
  },
  {
    rule: 'IsFilename',
    validate: (p, v) => {
      if (typeof v !== 'string' || !p.accept?.length) return true;
      return p.accept.some((pattern) => {
        if (pattern.startsWith('.')) return v.endsWith(pattern);
        if (pattern.includes('*')) {
          const [type] = pattern.split('/');
          // Simple MIME wildcard check — full impl in web module
          return v.includes(type ?? '');
        }
        return false;
      });
    },
    toJsonSchema: () => ({ type: 'string' }),
  },
);

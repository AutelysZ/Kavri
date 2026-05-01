

import { type AnyConstructor, type ClassDecorator, createClassDecorator, Metadata } from '@kavri/basic';
import type { ObjectOptions } from './decorators/object.js';
import { FieldSchema } from './field.js';

// ---------------------------------------------------------------------------
// @Schema decorator
// ---------------------------------------------------------------------------

interface SchemaMetadata<T extends object = object> extends ObjectOptions<T> {
  slug?: string;
}

/**
 * Marks a class as a schema.
 *
 * @example
 * ```ts
 * @Schema({ description: 'A user' })
 * class User {
 *   @IsString() name!: string;
 *   @IsInteger() age!: number;
 * }
 * ```
 */
export function Schema<T extends object = object>(
  options: ObjectOptions<T> = {},
): ClassDecorator<SchemaMetadata<T>> {
  return createClassDecorator<SchemaMetadata<T>>(Schema, options);
}

const schemaCache = new WeakMap<AnyConstructor, SchemaMetadata>();

// Get class schema. Aggregates all field decorator metadata.
export function getSchema<T extends object>(target: AnyConstructor<T> | T): SchemaMetadata<T> {
  const ctor = typeof target === 'function' ? target : target.constructor;
  return schemaCache.getOrInsertComputed(ctor as AnyConstructor, () => {
    const schemas = Metadata.ofClass(Schema, target);
    if (!schemas) {
      return {};
    }
    // we need to support subclasses
    const fields = Metadata.lookupField(FieldSchema, target);
    return schemas.reduce(
      (previousValue, currentValue) => {
        return {
          ...previousValue,
          ...currentValue,
          properties: {
            ...previousValue.properties,
            ...currentValue.properties,
          },
        };
      },
      {
        properties: fields ? Object.fromEntries(fields.entries()) : {},
      },
    );
  }) as SchemaMetadata<T>;
}

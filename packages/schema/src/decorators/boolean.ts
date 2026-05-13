import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
} from '../field.js';
import { addType, isBoolean, isNumber, isString } from '../utils.js';
import { decoupleTypeOptions, Info, type TypeOptions } from './base.js';
import { IsNumber } from './number.js';
import { IsString } from './string.js';

/**
 * Boolean field. Composes `Info` from `TypeOptions<boolean>`. When
 * `schema.type` is `false`, `Dummy` is used in place of the type assertion
 * (useful inside `AllOf` compositions).
 */
export const IsBoolean = createFieldSchemaDecoratorFactory(
  'IsBoolean',
  (schema: TypeOptions<boolean> = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleTypeOptions(schema);
    const deps: FieldSchemaDecorator[] = [Info(info)];
    return FieldSchema<undefined>(schema.type === false ? Dummy : IsBoolean, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: '.label must be a boolean',
    decode: ({ value }) => isBoolean(value),
    default: () => false,
    toJsonSchema: addType('boolean'),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined => {
      return hasType('boolean') ? IsBoolean() : void 0;
    },
  },
);

/**
 * Coerce string / number to boolean. Adds `IsBoolean(schema)` as a dep so the
 * coerced value is validated.
 *
 * - `'true'` / `'1'` (case-insensitive) → `true`
 * - `'false'` / `'0'` (case-insensitive) → `false`
 * - any non-zero `number` → `true`, `0` → `false`
 * - already a `boolean` → passes through unchanged
 * - any other input passes through unchanged so `IsBoolean` rejects it
 */
export const ToBoolean = createFieldSchemaDecoratorFactory(
  'ToBoolean',
  (schema: TypeOptions<boolean> = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(schema);
    return FieldSchema<undefined>(ToBoolean, void 0, opts, [
      IsBoolean(info),
      IsString(),
      IsNumber(),
    ]);
  },
  {
    phase: Phase.Coercion,
    message: '.label is invalid',
    decode: ({ value, provide }) => {
      if (isBoolean(value)) return true;
      if (isString(value)) {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1') return provide(true);
        if (lower === 'false' || lower === '0') return provide(false);
        return false;
      }
      if (isNumber(value)) return provide(value !== 0);
      return true;
    },
  },
);

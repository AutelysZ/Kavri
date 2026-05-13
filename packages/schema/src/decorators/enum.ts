import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
} from '../field.js';
import { enumKeys, type EnumLike, enumValues } from '../utils.js';
import { type BaseOptions, Info } from './base.js';

/**
 * Options for `IsEnum`.
 */
export interface EnumOptions extends BaseOptions {
  /**
   * OpenAPI/Swagger `x-enum-varnames` annotation for the values.
   */
  varnames?: string[];
  /**
   * OpenAPI/Swagger `x-enum-descriptions` annotation for the values.
   */
  descriptions?: string[];
}

/**
 * Runtime params stored on the `IsEnum` metadata.
 */
interface EnumParams {
  values: Array<string | number>;
  set: Set<string | number>;
  varnames?: string[];
  descriptions?: string[];
}

/**
 * Restrict a field to a fixed set of `string` / `number` values. Accepts
 * either a literal array (use `as const` for best inference) or a TypeScript
 * `enum` (string and/or numeric).
 *
 * `decode` (Phase.Semantics) checks `params.set.has(value)` — that single
 * lookup covers both type and membership, so no separate `IsString` /
 * `IsNumber` dep is added. `toJsonSchema` emits a `type` synthesized from the
 * value list (e.g. `['string', 'number']` for mixed enums) plus `enum` and
 * the OpenAPI `x-enum-*` annotations.
 *
 * @example
 * ```ts
 * @IsEnum(['on', 'off'] as const)
 * state!: 'on' | 'off';
 *
 * enum Role { Admin = 'admin', User = 'user' }
 * @IsEnum(Role)
 * role!: Role;
 * ```
 */
export const IsEnum = createFieldSchemaDecoratorFactory(
  'IsEnum',
  <const T extends Array<string | number> | EnumLike>(
    host: T,
    options: EnumOptions = {},
  ): FieldSchemaDecorator<EnumParams> => {
    const { varnames: vn, descriptions, ...rest } = options;
    const [opts, info] = decoupleOptions(rest);

    let values: Array<string | number>;
    let varnames: string[] | undefined = vn;
    if (Array.isArray(host)) {
      values = host as Array<string | number>;
    } else {
      values = enumValues(host);
      varnames ??= enumKeys(host);
    }

    return FieldSchema<EnumParams>(
      IsEnum,
      { values, set: new Set(values), varnames, descriptions },
      opts,
      [Info(info)],
    );
  },
  {
    phase: Phase.Semantics,
    message: ({ params }) => `.label should be one of: ${params.values.join(', ')}`,
    decode: ({ value, params }) => params.set.has(value as never),
    default: ({ params }) => params.values[0],
    toJsonSchema: ({ params: { values, varnames, descriptions } }) => {
      const types = [...new Set(values.map((v) => typeof v))];
      return {
        type: (types.length === 1 ? types[0] : types) as string | string[],
        enum: [...values],
        'x-enum-varnames': varnames,
        'x-enum-descriptions': descriptions,
      };
    },
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined => {
      return schema.enum
        ? IsEnum(schema.enum as Array<string | number>, {
            varnames: schema['x-enum-varnames'] as string[] | undefined,
            descriptions: schema['x-enum-descriptions'] as string[] | undefined,
          })
        : void 0;
    },
  },
);

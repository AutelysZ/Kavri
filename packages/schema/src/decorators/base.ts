import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  ofBoolField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import type { JsonSchema } from '../jsonschema.js';
import { addType, hasType, isBoolean, isEqual } from '../utils.js';

export interface BaseSchema {
  title?: string;
  description?: string;
  readOnly?: boolean;
  writeOnly?: boolean;
  rawSchema?: JsonSchema;
}

export interface BaseOptions<V = unknown> extends BaseSchema, ValidateOptions {
  deprecated?: string;
  optional?: ValidateField<boolean>;
  nullable?: ValidateField<boolean>;
  examples?: V[];
  default?: ValidateField<V>;
  const?: ValidateField<V>;
}

export interface TypeOptions<V = unknown> extends BaseOptions<V> {
  /**
   * Customize the message for inlined type decorator.
   *
   * The boolean `false` means don't apply type decorator, which is used for
   * conditional rules.
   *
   * For example:
   *
   * ```ts
   * // Customize IsString()'s message
   * @IsEmail(void 0, { type: 'should be a email string' })
   *
   * // Don't apply IsString() for AllOf constraints.
   * @AllOf([
   *    IsEmail(void 0, { type: false }),
   *    IsAscii({ type: false, maxLength: 128 }),
   * ])
   * @IsString({ message: 'should be a string' })
   * ````
   */
  type?: string | false;
}

export function decoupleTypeOptions<T extends TypeOptions>({
  type,
  message = isBoolean(type) ? void 0 : type,
  ...info
}: T): [ValidateOptions, Omit<T, 'message' | 'type'>] {
  return [{ message, label: info.label }, info];
}

export const Info = createFieldSchemaDecoratorFactory(
  'Info',
  ({
    deprecated,
    optional,
    nullable,
    examples,
    default: _default,
    const: _const,
    label,
    message,
    ...schema
  }: BaseOptions): FieldSchemaDecorator<BaseSchema> => {
    const deps: FieldSchemaDecorator[] = [];
    if (deprecated) deps.push(Deprecated(deprecated));
    if (optional) deps.push(IsOptional(ofBoolField(optional)[1]));
    if (nullable) deps.push(IsNullable(ofBoolField(nullable)[1]));
    if (examples) deps.push(Examples(examples));
    if (_default) deps.push(Default(_default));
    if (_const) deps.push(IsConst(_const));
    return FieldSchema<BaseSchema>(Info, schema, { label: label ?? schema.title, message }, deps);
  },
  {
    phase: Phase.Info,
    message: '',
    toJsonSchema: ({ rawSchema, ...schema }) => ({
      ...rawSchema,
      ...schema,
    }),
    fromJsonSchema: ({
      title,
      description,
      readOnly,
      writeOnly,
      ...rawSchema
    }): FieldSchemaDecorator | undefined => {
      return Info({ title, description, readOnly, writeOnly, rawSchema });
    },
  },
);

export const Examples = createFieldSchemaDecoratorFactory(
  'Examples',
  <V>(examples: readonly V[]): FieldSchemaDecorator<readonly V[]> => {
    return FieldSchema<readonly V[]>(Examples, examples, void 0);
  },
  {
    phase: Phase.Info,
    message: '',
    toJsonSchema: (params) => ({ examples: params as unknown[] }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return schema.examples ? Examples(schema.examples) : void 0;
    },
  },
);

export const Deprecated = createFieldSchemaDecoratorFactory(
  'Deprecated',
  (message: string): FieldSchemaDecorator<string> => {
    return FieldSchema<string>(Deprecated, message, void 0);
  },
  {
    phase: Phase.Info,
    message: '',
    toJsonSchema: (params, current) => ({
      description: `[Deprecated] ${params}\n\n${current.description}`.trim(),
      deprecated: true,
    }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return schema.deprecated ? Deprecated('') : void 0;
    },
  },
);

export const Default = createFieldSchemaDecoratorFactory(
  'Default',
  <T>(value: T): FieldSchemaDecorator<T> => {
    return FieldSchema<T>(Default, value, void 0);
  },
  {
    phase: Phase.Defaults,
    message: '',
    decode: ({ value, params, provide }) => value !== void 0 || provide(params),
    toJsonSchema: (params) => ({ default: params }),
    fromJsonSchema: (schema, current): FieldSchemaDecorator | undefined => {
      return schema.default === void 0 ||
        current.some((v) => v.metadata.factory.phase === Phase.Defaults)
        ? void 0
        : Default(schema.default);
    },
  },
);

export const IsOptional = createFieldSchemaDecoratorFactory(
  'IsOptional',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsOptional, void 0, options);
  },
  {
    phase: Phase.Presence,
    message: '.label should be undefined',
    decode: ({ value }) => value === void 0,
  },
);

export const IsNullable = createFieldSchemaDecoratorFactory(
  'IsNullable',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsNullable, void 0, options);
  },
  {
    phase: Phase.Presence,
    message: '.label should be null',
    decode: ({ value }) => value === null,
    toJsonSchema: addType('null'),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return hasType(schema, 'null') ? IsNullable() : void 0;
    },
  },
);

export const IsConst = createFieldSchemaDecoratorFactory(
  'IsConst',
  <V>(value: V, options: ValidateOptions = {}): FieldSchemaDecorator<V> => {
    return FieldSchema<V>(IsConst, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label should be .params',
    decode: ({ value, params }) => isEqual(value, params),
    toJsonSchema: (params) => ({ const: params }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return schema.const === void 0 ? void 0 : IsConst(schema.const);
    },
  },
);

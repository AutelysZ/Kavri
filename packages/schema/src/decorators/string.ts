import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  ofBoolField,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { addType, hasType, isNumber, isString } from '../utils.js';
import { decoupleTypeOptions, Info, type TypeOptions } from './base.js';
import { IsNumber } from './number.js';

export const MinLength = createFieldSchemaDecoratorFactory(
  'MinLength',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MinLength, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be at least .params characters',
    decode: ({ value, params }) => !isString(value) || value.length >= params,
    toJsonSchema: (p) => ({ minLength: p }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return isNumber(schema.minLength) ? MinLength(schema.minLength) : void 0;
    },
  },
);

export const MaxLength = createFieldSchemaDecoratorFactory(
  'MaxLength',
  (value: number, options?: ValidateOptions): FieldSchemaDecorator<number> => {
    return FieldSchema(MaxLength, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be at most .params characters',
    decode: ({ value, params }) => !isString(value) || value.length <= params,
    toJsonSchema: (p) => ({ maxLength: p }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return isNumber(schema.maxLength) ? MaxLength(schema.maxLength) : void 0;
    },
  },
);

export const Pattern = createFieldSchemaDecoratorFactory(
  'Pattern',
  (value: string, options?: ValidateOptions): FieldSchemaDecorator<string> => {
    return FieldSchema(Pattern, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must match pattern .params',
    decode: ({ value, params }) => !isString(value) || new RegExp(params).test(value),
    toJsonSchema: (p) => ({ pattern: p }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return isString(schema.pattern) ? Pattern(schema.pattern) : void 0;
    },
  },
);

export const AllowEmpty = createFieldSchemaDecoratorFactory(
  'AllowEmpty',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(AllowEmpty, void 0, options);
  },
  {
    phase: Phase.Presence,
    message: '',
    decode: ({ value }) => value === '',
  },
);

export interface StringOptions<V extends string = string> extends TypeOptions<V> {
  maxLength?: ValidateField<number>;
  minLength?: ValidateField<number>;
  pattern?: ValidateField<string>;
  format?: ValidateField<string>;
  allowEmpty?: ValidateField<boolean>;
}

export const IsString = createFieldSchemaDecoratorFactory(
  'IsString',
  <V extends string = string>({
    minLength,
    maxLength,
    pattern,
    allowEmpty,
    ...options
  }: StringOptions<V> = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleTypeOptions(options);
    const deps: FieldSchemaDecorator[] = [Info(info)];
    if (allowEmpty) deps.push(AllowEmpty(ofBoolField(allowEmpty)[1]));
    if (minLength !== undefined) deps.push(MinLength(...ofValueField(minLength)));
    if (maxLength !== undefined) deps.push(MaxLength(...ofValueField(maxLength)));
    if (pattern !== undefined) deps.push(Pattern(...ofValueField(pattern)));
    return FieldSchema<undefined>(options.type === false ? Dummy : IsString, void 0, opts, deps);
  },
  {
    phase: Phase.Type,
    message: ({ value }) => `.label should be a string, got ${typeof value}`,
    decode: ({ value }) => isString(value),
    toJsonSchema: addType('string'),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return hasType(schema, 'string') ? IsString() : void 0;
    },
  },
);

export const ToString = createFieldSchemaDecoratorFactory(
  'ToString',
  (options: StringOptions = {}): FieldSchemaDecorator<undefined> => {
    const [opts, info] = decoupleOptions(options);
    return FieldSchema<undefined>(ToString, void 0, opts, [IsString(info), IsNumber()]);
  },
  {
    phase: Phase.Coercion,
    message: '.label should be coercible to string',
    decode: ({ value, provide }) => !isNumber(value) || provide(value + ''),
  },
);

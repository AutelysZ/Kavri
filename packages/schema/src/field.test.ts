import { describe, expect, it } from 'vitest';
import type { ClassDecorator } from '@kavri/basic';
import { createClassDecorator, Metadata } from '@kavri/basic';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  FieldSchemaDecoratorName,
  toValidateSchema,
  type ValidateSchema,
} from './field.js';

// Dummy class decorator to flush TC39 metadata
function Tag(): ClassDecorator<object> {
  return createClassDecorator(Tag, {});
}

describe('toValidateSchema', () => {
  it('wraps raw value', () => {
    expect(toValidateSchema(3)).toEqual({ value: 3 });
  });

  it('wraps string value', () => {
    expect(toValidateSchema('hello')).toEqual({ value: 'hello' });
  });

  it('wraps boolean value', () => {
    expect(toValidateSchema(true)).toEqual({ value: true });
  });

  it('passes through ValidateSchema as-is', () => {
    const schema = { value: 3, message: 'too short' };
    expect(toValidateSchema(schema)).toBe(schema);
  });

  it('wraps null as raw value', () => {
    expect(toValidateSchema(null)).toEqual({ value: null });
  });

  it('wraps array as raw value', () => {
    const arr = [1, 2, 3];
    expect(toValidateSchema(arr)).toEqual({ value: arr });
  });

  it('wraps object without value property as raw value', () => {
    const obj = { min: 1 };
    expect(toValidateSchema(obj)).toEqual({ value: obj });
  });
});

describe('createFieldSchemaDecoratorFactory', () => {
  it('attaches statics to factory function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validate = (_params: any, value: unknown) =>
      typeof value === 'string' && value.length >= _params.value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toJsonSchema = (params: any) => ({ minLength: params.value });

    const MinLength = createFieldSchemaDecoratorFactory(
      'MinLength',
      (options: ValidateSchema<number>): FieldSchemaDecorator<ValidateSchema<number>> => {
        return FieldSchema(MinLength, options);
      },
      {
        message: '.label must be at least .value characters',
        validate,
        toJsonSchema,
      },
    );

    expect(MinLength[FieldSchemaDecoratorName]).toBe('MinLength');
    expect(MinLength.message).toBe('.label must be at least .value characters');
    expect(MinLength.validate).toBe(validate);
    expect(MinLength.toJsonSchema).toBe(toJsonSchema);
    expect(typeof MinLength).toBe('function');
  });

  it('factory returns a working decorator', () => {
    const MinLength = createFieldSchemaDecoratorFactory(
      'MinLength',
      (options: ValidateSchema<number>): FieldSchemaDecorator<ValidateSchema<number>> => {
        return FieldSchema(MinLength, options);
      },
      {
        message: '.label must be at least .value characters',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validate: (params: any, value: any) =>
          typeof value !== 'string' || value.length >= params.value,
      },
    );

    @Tag()
    class Foo {
      @MinLength({ value: 3 })
      name!: string;
    }

    const entries = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Metadata.ofField(FieldSchema as any, Foo, 'name' as any);
    expect(entries).toHaveLength(1);
    const meta = entries[0].metadata as FieldSchemaDecoratorMetadata<ValidateSchema<number>>;
    expect(meta.rule).toBe('MinLength');
    expect(meta.factory).toBe(MinLength);
    expect(meta.params).toEqual({ value: 3 });
    expect(meta.children).toEqual([]);
    expect(meta.deps).toEqual([]);
  });
});

describe('FieldSchema', () => {
  it('creates a decorator with metadata', () => {
    const IsString = createFieldSchemaDecoratorFactory(
      'IsString',
      (options: ValidateSchema<string>): FieldSchemaDecorator<ValidateSchema<string>> => {
        return FieldSchema(IsString, options);
      },
      {
        message: '.label must be a string',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validate: (_: any, value: any) => typeof value === 'string',
        toJsonSchema: () => ({ type: 'string' }),
      },
    );

    const decorator = IsString({ value: 'test' });
    expect(decorator.metadata).toBeDefined();
    expect(decorator.metadata.rule).toBe('IsString');
    expect(decorator.metadata.factory).toBe(IsString);
    expect(decorator.metadata.params).toEqual({ value: 'test' });
  });

  it('collects children', () => {
    const MinLength = createFieldSchemaDecoratorFactory(
      'MinLength',
      (options: ValidateSchema<number>): FieldSchemaDecorator<ValidateSchema<number>> => {
        return FieldSchema(MinLength, options);
      },
       
      {
        message: '.label must be at least .value characters',
        validate: (p: any, v: any) => typeof v !== 'string' || v.length >= p.value,
      },
    );

    const MaxLength = createFieldSchemaDecoratorFactory(
      'MaxLength',
      (options: ValidateSchema<number>): FieldSchemaDecorator<ValidateSchema<number>> => {
        return FieldSchema(MaxLength, options);
      },
       
      {
        message: '.label must be at most .value characters',
        validate: (p: any, v: any) => typeof v !== 'string' || v.length <= p.value,
      },
    );

    const IsString = createFieldSchemaDecoratorFactory(
      'IsString',
      (options: { minLength?: number; maxLength?: number }): FieldSchemaDecorator => {
        const children: FieldSchemaDecorator[] = [];
        if (options.minLength !== undefined) children.push(MinLength({ value: options.minLength }));
        if (options.maxLength !== undefined) children.push(MaxLength({ value: options.maxLength }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return FieldSchema(IsString, options as any, children);
      },
      {
        message: '.label must be a string',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validate: (_: any, value: any) => typeof value === 'string',
        toJsonSchema: () => ({ type: 'string' }),
      },
    );

    @Tag()
    class Foo {
      @IsString({ minLength: 1, maxLength: 100 })
      name!: string;
    }

    const entries = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Metadata.ofField(FieldSchema as any, Foo, 'name' as any);
    expect(entries).toHaveLength(1);
    const meta = entries[0].metadata as FieldSchemaDecoratorMetadata;
    expect(meta.children).toHaveLength(2);

    const [min, max] = meta.children;
    expect(min.metadata.rule).toBe('MinLength');
    expect(min.metadata.params.value).toBe(1);
    expect(max.metadata.rule).toBe('MaxLength');
    expect(max.metadata.params.value).toBe(100);
  });

  it('statics are callable on the factory', () => {
    const IsEmail = createFieldSchemaDecoratorFactory(
      'IsEmail',
      (): FieldSchemaDecorator => FieldSchema(IsEmail, {}),
      {
        message: 'must be a valid email',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        validate: (_: any, value: any) => typeof value === 'string' && value.includes('@'),
        toJsonSchema: () => ({ type: 'string', format: 'email' }),
      },
    );

    expect(IsEmail.validate?.({}, 'test@example.com', {})).toBe(true);
    expect(IsEmail.validate?.({}, 'not-email', {})).toBe(false);
    expect(IsEmail.toJsonSchema?.({})).toEqual({ type: 'string', format: 'email' });
  });
});

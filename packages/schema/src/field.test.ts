import { describe, it, expect } from 'vitest';
import { Metadata } from '@kavri/basic';
import type { ClassDecorator } from '@kavri/basic';
import { createClassDecorator } from '@kavri/basic';
import { toValidateSchema, createSchemaFieldDecoratorFactory, SchemaField } from './field.js';
import type {
  ValidateSchema,
  SchemaFieldDecorator,
  SchemaFieldDecoratorMetadata,
} from './types.js';

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

describe('createSchemaFieldDecoratorFactory', () => {
  it('attaches statics to factory function', () => {
    const validate = (_params: ValidateSchema<number>, value: unknown) =>
      typeof value === 'string' && value.length >= (_params as ValidateSchema<number>).value;
    const toJsonSchema = (params: ValidateSchema<number>) => ({
      minLength: params.value,
    });

    const MinLength = createSchemaFieldDecoratorFactory(
      function MinLength(
        options: ValidateSchema<number>,
      ): SchemaFieldDecorator<ValidateSchema<number>> {
        return SchemaField(MinLength, options);
      },
      {
        message: '.label must be at least .value characters',
        validate,
        toJsonSchema,
      },
    );

    expect(MinLength.message).toBe('.label must be at least .value characters');
    expect(MinLength.validate).toBe(validate);
    expect(MinLength.toJsonSchema).toBe(toJsonSchema);
    expect(typeof MinLength).toBe('function');
  });

  it('factory returns a working decorator', () => {
    const MinLength = createSchemaFieldDecoratorFactory(
      function MinLength(
        options: ValidateSchema<number>,
      ): SchemaFieldDecorator<ValidateSchema<number>> {
        return SchemaField(MinLength, options);
      },
      {
        validate: (params, value) => typeof value !== 'string' || value.length >= params.value,
      },
    );

    @Tag()
    class Foo {
      @MinLength({ value: 3 })
      name!: string;
    }

    const meta = Metadata.of(MinLength, Foo, 'name') as SchemaFieldDecoratorMetadata<
      ValidateSchema<number>
    >[];
    expect(meta).toHaveLength(1);
    expect(meta[0].factory).toBe(MinLength);
    expect(meta[0].params).toEqual({ value: 3 });
    expect(meta[0].decorators).toEqual([]);
  });
});

describe('SchemaField', () => {
  it('creates a decorator with metadata', () => {
    const IsString = createSchemaFieldDecoratorFactory(
      function IsString(
        options: ValidateSchema<string>,
      ): SchemaFieldDecorator<ValidateSchema<string>> {
        return SchemaField(IsString, options);
      },
      {
        validate: (_, value) => typeof value === 'string',
        toJsonSchema: () => ({ type: 'string' }),
      },
    );

    const decorator = IsString({ value: 'test' });
    expect(decorator.metadata).toBeDefined();
    expect(decorator.metadata.factory).toBe(IsString);
    expect(decorator.metadata.params).toEqual({ value: 'test' });
  });

  it('collects child decorators', () => {
    const MinLength = createSchemaFieldDecoratorFactory(
      function MinLength(
        options: ValidateSchema<number>,
      ): SchemaFieldDecorator<ValidateSchema<number>> {
        return SchemaField(MinLength, options);
      },
      { validate: (p, v) => typeof v !== 'string' || v.length >= p.value },
    );

    const MaxLength = createSchemaFieldDecoratorFactory(
      function MaxLength(
        options: ValidateSchema<number>,
      ): SchemaFieldDecorator<ValidateSchema<number>> {
        return SchemaField(MaxLength, options);
      },
      { validate: (p, v) => typeof v !== 'string' || v.length <= p.value },
    );

    const IsString = createSchemaFieldDecoratorFactory(
      function IsString(options: { minLength?: number; maxLength?: number }): SchemaFieldDecorator {
        const children: SchemaFieldDecorator[] = [];
        if (options.minLength !== undefined) children.push(MinLength({ value: options.minLength }));
        if (options.maxLength !== undefined) children.push(MaxLength({ value: options.maxLength }));
        return SchemaField(IsString, options, children);
      },
      {
        validate: (_, value) => typeof value === 'string',
        toJsonSchema: () => ({ type: 'string' }),
      },
    );

    @Tag()
    class Foo {
      @IsString({ minLength: 1, maxLength: 100 })
      name!: string;
    }

    const meta = Metadata.of(IsString, Foo, 'name') as SchemaFieldDecoratorMetadata[];
    expect(meta).toHaveLength(1);
    expect(meta[0].decorators).toHaveLength(2);

    const [min, max] = meta[0].decorators;
    expect((min.metadata as SchemaFieldDecoratorMetadata<ValidateSchema<number>>).factory).toBe(
      MinLength,
    );
    expect(
      (min.metadata as SchemaFieldDecoratorMetadata<ValidateSchema<number>>).params.value,
    ).toBe(1);
    expect((max.metadata as SchemaFieldDecoratorMetadata<ValidateSchema<number>>).factory).toBe(
      MaxLength,
    );
    expect(
      (max.metadata as SchemaFieldDecoratorMetadata<ValidateSchema<number>>).params.value,
    ).toBe(100);
  });

  it('merges params.decorators with explicit decorators', () => {
    const A = createSchemaFieldDecoratorFactory(function A(): SchemaFieldDecorator {
      return SchemaField(A, {});
    }, {});
    const B = createSchemaFieldDecoratorFactory(function B(): SchemaFieldDecorator {
      return SchemaField(B, {});
    }, {});
    const C = createSchemaFieldDecoratorFactory(function C(): SchemaFieldDecorator {
      // params.decorators = [A()], explicit decorators = [B()]
      return SchemaField(C, { decorators: [A()] }, [B()]);
    }, {});

    const dec = C();
    // params.decorators come first, then explicit
    expect(dec.metadata.decorators).toHaveLength(2);
    expect(dec.metadata.decorators[0].metadata.factory).toBe(A);
    expect(dec.metadata.decorators[1].metadata.factory).toBe(B);
  });

  it('statics are callable on the factory', () => {
    const IsEmail = createSchemaFieldDecoratorFactory(
      function IsEmail(): SchemaFieldDecorator {
        return SchemaField(IsEmail, {});
      },
      {
        message: 'must be a valid email',
        validate: (_, value) => typeof value === 'string' && value.includes('@'),
        toJsonSchema: () => ({ type: 'string', format: 'email' }),
      },
    );

    expect(IsEmail.validate?.({}, 'test@example.com')).toBe(true);
    expect(IsEmail.validate?.({}, 'not-email')).toBe(false);
    expect(IsEmail.toJsonSchema?.({})).toEqual({ type: 'string', format: 'email' });
  });
});

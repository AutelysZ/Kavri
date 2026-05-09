import { describe, expect, it } from 'vitest';
import { IsArray } from './decorators/array.js';
import { Default, IsNullable, IsOptional } from './decorators/base.js';
import { IsBoolean } from './decorators/boolean.js';
import { IsEnum } from './decorators/enum.js';
import { IsInteger, IsNumber, ToBigInt } from './decorators/number.js';
import { IsMap, IsObject, IsRecord, Ref } from './decorators/object.js';
import { IsString } from './decorators/string.js';
import { defaultOf } from './defaults.js';
import { Schema } from './schema.js';

describe('defaultOf', () => {
  it('uses explicit defaults before optional or nullable rules', () => {
    @Schema()
    class Example {
      @Default('configured')
      @IsOptional()
      @IsNullable()
      @IsString()
      value!: string | undefined | null;
    }

    expect(defaultOf(Example)).toMatchObject({ value: 'configured' });
  });

  it('uses undefined for optional fields and null for nullable fields', () => {
    @Schema()
    class Example {
      @IsOptional()
      @IsString()
      optional!: string | undefined;

      @IsNullable()
      @IsString()
      nullable!: string | null;
    }

    const value = defaultOf(Example);
    expect(value).toHaveProperty('optional', undefined);
    expect(value).toHaveProperty('nullable', null);
  });

  it('uses the first enum value', () => {
    @Schema()
    class Example {
      @IsEnum(['draft', 'published'] as const)
      status!: 'draft' | 'published';
    }

    expect(defaultOf(Example).status).toBe('draft');
  });

  it('uses primitive type defaults', () => {
    @Schema()
    class Example {
      @IsString()
      text!: string;

      @IsNumber()
      count!: number;

      @IsInteger()
      index!: number;

      @ToBigInt()
      id!: bigint;

      @IsBoolean()
      active!: boolean;
    }

    expect(defaultOf(Example)).toMatchObject({
      text: '',
      count: 0,
      index: 0,
      id: 0n,
      active: false,
    });
  });

  it('creates nested defaults for class refs', () => {
    @Schema()
    class Child {
      @IsString()
      name!: string;
    }

    @Schema()
    class Parent {
      @Ref(Child)
      child!: Child;
    }

    const value = defaultOf(Parent);
    expect(value.child).toBeInstanceOf(Child);
    expect(value.child.name).toBe('');
  });

  it('creates nested defaults for inline object properties', () => {
    expect(defaultOf(IsObject({ name: IsString(), age: IsNumber() }))).toEqual({
      name: '',
      age: 0,
    });
  });

  it('uses collection defaults for maps, arrays, and records', () => {
    expect(defaultOf(IsMap(IsString()))).toEqual(new Map());
    expect(defaultOf(IsArray(IsString()))).toEqual([]);
    expect(defaultOf(IsRecord(IsString()))).toEqual({});
  });

  it('returns undefined when no default can be inferred', () => {
    expect(defaultOf([])).toBeUndefined();
  });
});

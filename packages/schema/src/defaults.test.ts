import { describe, expect, it } from 'vitest';
import { IsArray } from './decorators/array.js';
import { Default, IsConst, IsNullable, IsOptional } from './decorators/base.js';
import { IsBoolean } from './decorators/boolean.js';
import { AllOf, AnyOf, IfThenElse, Not, OneOf } from './decorators/composite.js';
import { IsJSON } from './decorators/contentType.js';
import { IsEnum } from './decorators/enum.js';
import { IsInteger, IsNumber, ToBigInt } from './decorators/number.js';
import { IsMap, IsObject, IsRecord, Ref } from './decorators/object.js';
import { IsString } from './decorators/string.js';
import { DefaultDate, IsDate, IsDuration } from './decorators/time.js';
import { defaultOf } from './defaults.js';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
} from './field.js';
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

  it('uses phase strategy for short-circuit defaults', () => {
    expect(defaultOf([Default('abc'), IsNullable()])).toBe('abc');
  });

  it('uses falsy defaults and const values from type options', () => {
    expect(defaultOf(IsNumber({ default: 0 }))).toBe(0);
    expect(defaultOf(IsBoolean({ const: false }))).toBe(false);
  });

  it('lets later phases refine an earlier type default', () => {
    expect(defaultOf([IsString(), IsEnum(['abc'] as const)])).toBe('abc');
  });

  it('uses the first provider in an AnyPass phase', () => {
    expect(defaultOf([IsString(), IsNumber()])).toBe('');
  });

  it('creates defaults for composition decorators', () => {
    expect(defaultOf(AnyOf([IsNumber(), IsString()]))).toBe(0);
    expect(defaultOf(OneOf([IsEnum(['one'] as const), IsNumber()]))).toBe('one');
    expect(
      defaultOf(AllOf([IsObject({ left: IsString() }), IsObject({ right: IsNumber() })])),
    ).toEqual({
      left: '',
      right: 0,
    });
    expect(defaultOf(AllOf([IsString(), IsEnum(['refined'] as const)]))).toBe('refined');
    expect(
      defaultOf(IfThenElse({ if: IsString(), then: IsEnum(['then'] as const), else: IsNumber() })),
    ).toBeUndefined();
    expect(defaultOf(Not(IsString()))).toBeUndefined();
  });

  it('distinguishes no default from an explicit undefined default', () => {
    const NoDefault = createFieldSchemaDecoratorFactory(
      'NoDefault',
      (): FieldSchemaDecorator<undefined> => FieldSchema(NoDefault, void 0, void 0),
      {
        phase: Phase.Semantics,
        message: '',
        default: () => undefined,
      },
    );
    const UndefinedDefault = createFieldSchemaDecoratorFactory(
      'UndefinedDefault',
      (): FieldSchemaDecorator<undefined> => FieldSchema(UndefinedDefault, void 0, void 0),
      {
        phase: Phase.Semantics,
        message: '',
        default: ({ provide }) => provide(undefined),
      },
    );

    expect(defaultOf([IsString(), NoDefault()])).toBe('');
    expect(defaultOf([IsString(), UndefinedDefault()])).toBeUndefined();
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

      @IsConst('fixed')
      constValue!: 'fixed';
    }

    expect(defaultOf(Example)).toMatchObject({
      status: 'draft',
      constValue: 'fixed',
    });
  });

  it('does not infer string defaults for object-like scalar validators', () => {
    expect(defaultOf(IsDate())).toBeUndefined();
    expect(defaultOf(IsDuration())).toBeUndefined();
  });

  it('does not infer decoded content defaults for encoded values', () => {
    expect(defaultOf(IsJSON(IsObject({ payload: IsString() })))).toBe('');
  });

  it('uses explicit date defaults', () => {
    const value = new Date('2026-05-13T00:00:00.000Z');

    expect(defaultOf(DefaultDate(value))).toEqual(value);
    expect(defaultOf([DefaultDate(value), IsDate()])).toEqual(value);
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

  it('creates a complex default object covering every default source', () => {
    const NoDefault = createFieldSchemaDecoratorFactory(
      'NoDefault',
      (): FieldSchemaDecorator<undefined> => FieldSchema(NoDefault, void 0, void 0),
      {
        phase: Phase.Semantics,
        message: '',
      },
    );

    @Schema()
    class Profile {
      @IsString()
      name!: string;

      @IsNumber()
      score!: number;
    }

    @Schema()
    class Example {
      @Default('configured')
      @IsNullable()
      @IsString()
      explicit!: string | null;

      @IsOptional()
      @IsString()
      optional!: string | undefined;

      @IsNullable()
      @IsString()
      nullable!: string | null;

      @IsEnum(['draft', 'published'] as const)
      status!: 'draft' | 'published';

      @IsConst('fixed')
      constValue!: 'fixed';

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

      @IsObject({
        title: IsString(),
        nested: IsObject({ enabled: IsBoolean() }),
        choice: IsEnum([1, 2] as const),
      })
      object!: {
        title: string;
        nested: { enabled: boolean };
        choice: 1 | 2;
      };

      @Ref(Profile)
      profile!: Profile;

      @IsMap(IsString())
      map!: Map<string, string>;

      @IsArray(IsString())
      list!: string[];

      @IsRecord(IsNumber())
      record!: Record<string, number>;

      @AnyOf([IsNumber(), IsString()])
      anyOf!: number | string;

      @OneOf([IsEnum(['one'] as const), IsNumber()])
      oneOf!: 'one' | number;

      @AllOf([IsObject({ left: IsString() }), IsObject({ right: IsNumber() })])
      allOf!: {
        left: string;
        right: number;
      };

      @Not(IsString())
      notString!: unknown;

      @NoDefault()
      unknown!: unknown;
    }

    const value = defaultOf(Example);

    expect(value).toBeInstanceOf(Example);
    expect(value).toHaveProperty('optional', undefined);
    expect(value).toHaveProperty('unknown', undefined);
    expect(value).toHaveProperty('notString', undefined);
    expect(value.profile).toBeInstanceOf(Profile);
    expect(value).toMatchObject({
      explicit: 'configured',
      nullable: null,
      status: 'draft',
      constValue: 'fixed',
      text: '',
      count: 0,
      index: 0,
      id: 0n,
      active: false,
      object: {
        title: '',
        nested: { enabled: false },
        choice: 1,
      },
      profile: {
        name: '',
        score: 0,
      },
      list: [],
      record: {},
      anyOf: 0,
      oneOf: 'one',
      allOf: {
        left: '',
        right: 0,
      },
    });
    expect(value.map).toEqual(new Map());
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

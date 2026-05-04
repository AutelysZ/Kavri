import type { ClassDecorator } from '@kavri/basic';
import { createClassDecorator, Metadata } from '@kavri/basic';
import { describe, expect, it } from 'vitest';
import { IsOptional } from './decorators/base.js';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  Phase,
} from './field.js';
import { Merge, Omit, Partial, Pick, PickPartial, Required } from './reshape.js';

// --- minimal test factories (no validator deps) ----------------------------

function Tag(): ClassDecorator<object> {
  return createClassDecorator(Tag, {});
}

export const StrType = createFieldSchemaDecoratorFactory(
  'StrType',
  (): FieldSchemaDecorator<undefined> => FieldSchema(StrType, void 0, void 0),
  { phase: Phase.Type, message: '', decode: ({ value }) => typeof value === 'string' },
);

export const Min = createFieldSchemaDecoratorFactory(
  'Min',
  (value: number): FieldSchemaDecorator<number> => FieldSchema(Min, value, void 0),
  { phase: Phase.Semantics, message: '', decode: () => true },
);

@Tag()
class Source {
  @StrType()
  @Min(3)
  a!: string;

  @StrType()
  b!: string;

  @StrType()
  c!: string;

  @IsOptional()
  @StrType()
  d!: string;
}

function fieldFactories(cls: object, key: string): unknown[] {
  const entries = Metadata.lookupField(FieldSchema, cls as never, key as never);
  return (entries ?? []).map((m) => (m as FieldSchemaDecoratorMetadata).factory);
}

function fieldKeys(cls: object): string[] {
  const all = Metadata.lookupField(FieldSchema, cls as never);
  return all ? [...all.keys()].map(String).sort() : [];
}

// ---------------------------------------------------------------------------

describe('Pick', () => {
  it('keeps only the listed fields', () => {
    const Picked = Pick(Source, 'a', 'b');
    expect(fieldKeys(Picked)).toEqual(['a', 'b']);
  });

  it('preserves all original decorators on each picked field', () => {
    const Picked = Pick(Source, 'a');
    expect(fieldFactories(Picked, 'a')).toContain(StrType);
    expect(fieldFactories(Picked, 'a')).toContain(Min);
  });
});

describe('Omit', () => {
  it('drops the listed fields, keeps the rest', () => {
    const Omitted = Omit(Source, 'a', 'd');
    expect(fieldKeys(Omitted)).toEqual(['b', 'c']);
  });
});

describe('Partial', () => {
  it('marks listed fields optional', () => {
    const Some = Partial(Source, 'a', 'b');
    expect(fieldFactories(Some, 'a')).toContain(IsOptional);
    expect(fieldFactories(Some, 'b')).toContain(IsOptional);
    expect(fieldFactories(Some, 'c')).not.toContain(IsOptional);
  });

  it('without keys marks every field optional', () => {
    const All = Partial(Source);
    for (const k of ['a', 'b', 'c', 'd']) {
      expect(fieldFactories(All, k)).toContain(IsOptional);
    }
  });

  it('does not double-stack `IsOptional` for already-optional fields', () => {
    const All = Partial(Source);
    expect(fieldFactories(All, 'd').filter((f) => f === IsOptional)).toHaveLength(1);
  });
});

describe('Required', () => {
  it('strips IsOptional from listed fields', () => {
    const Req = Required(Partial(Source), 'a');
    expect(fieldFactories(Req, 'a')).not.toContain(IsOptional);
    // other fields stay optional
    expect(fieldFactories(Req, 'b')).toContain(IsOptional);
  });

  it('without keys strips IsOptional from every field', () => {
    const Req = Required(Partial(Source));
    for (const k of ['a', 'b', 'c', 'd']) {
      expect(fieldFactories(Req, k)).not.toContain(IsOptional);
    }
  });
});

describe('PickPartial', () => {
  it('first array is required, second is optional', () => {
    const Combo = PickPartial(Source, ['a'], ['b', 'c']);
    expect(fieldKeys(Combo)).toEqual(['a', 'b', 'c']);
    expect(fieldFactories(Combo, 'a')).not.toContain(IsOptional);
    expect(fieldFactories(Combo, 'b')).toContain(IsOptional);
    expect(fieldFactories(Combo, 'c')).toContain(IsOptional);
  });
});

describe('Merge', () => {
  it('combines fields from multiple classes', () => {
    @Tag()
    class A {
      @StrType()
      a!: string;
    }
    @Tag()
    class B {
      @StrType()
      b!: string;
    }
    const Merged = Merge([A, B]);
    expect(fieldKeys(Merged)).toEqual(['a', 'b']);
  });

  it('right-most class wins on collision', () => {
    @Tag()
    class A {
      @StrType()
      x!: string;
    }
    @Tag()
    class B {
      @StrType()
      @Min(7)
      x!: string;
    }
    const Merged = Merge([A, B]);
    // B.x has [StrType, Min]; should override A's
    expect(fieldFactories(Merged, 'x')).toContain(Min);
  });
});

describe('composition', () => {
  it('matches the example: Required(UpdateUserRequest)-style chain', () => {
    const Step1 = Pick(Source, 'a');
    const Step2 = Partial(Pick(Source, 'b', 'c'));
    const Merged = Merge([Step1, Step2]);
    expect(fieldKeys(Merged)).toEqual(['a', 'b', 'c']);
    expect(fieldFactories(Merged, 'a')).not.toContain(IsOptional);
    expect(fieldFactories(Merged, 'b')).toContain(IsOptional);

    const Full = Required(Merged);
    for (const k of ['a', 'b', 'c']) {
      expect(fieldFactories(Full, k)).not.toContain(IsOptional);
    }
  });
});

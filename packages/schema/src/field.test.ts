import type { ClassDecorator } from '@kavri/basic';
import { createClassDecorator, Metadata } from '@kavri/basic';
import { describe, expect, it } from 'vitest';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  Dummy,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  FieldSchemaDecoratorName,
  getFieldSchema,
  isFieldSchemaDecorator,
  isFieldSchemaDecoratorFactory,
  isFieldSchemaDecoratorMetadata,
  ofArrayField,
  ofBoolField,
  ofNestedField,
  ofValueField,
  Phase,
} from './field.js';

// Dummy class decorator to flush TC39 metadata.
function Tag(): ClassDecorator<object> {
  return createClassDecorator(Tag, {});
}

describe('decoupleOptions', () => {
  it('extracts message and label, leaves rest intact', () => {
    const [opts, rest] = decoupleOptions({
      message: 'too short',
      label: 'name',
      title: 'Name',
      minLength: 3,
    });
    expect(opts).toEqual({ message: 'too short', label: 'name' });
    expect(rest).toEqual({ label: 'name', title: 'Name', minLength: 3 });
  });

  it('handles missing message', () => {
    const [opts, rest] = decoupleOptions({ label: 'x' });
    expect(opts).toEqual({ message: undefined, label: 'x' });
    expect(rest).toEqual({ label: 'x' });
  });
});

describe('ofBoolField', () => {
  it('unwraps a bare boolean', () => {
    expect(ofBoolField(true)).toEqual([true, undefined]);
    expect(ofBoolField(false)).toEqual([false, undefined]);
  });

  it('treats a bare ValidateOptions object as `true`', () => {
    const opts = { message: 'x' };
    expect(ofBoolField(opts)).toEqual([true, opts]);
  });

  it('unwraps a [bool, opts] tuple', () => {
    const opts = { label: 'L' };
    expect(ofBoolField([true, opts])).toEqual([true, opts]);
    expect(ofBoolField([false, opts])).toEqual([false, opts]);
  });
});

describe('ofValueField', () => {
  it('unwraps a bare value', () => {
    expect(ofValueField(3)).toEqual([3, undefined]);
    expect(ofValueField('hi')).toEqual(['hi', undefined]);
  });

  it('unwraps a [value, opts] tuple', () => {
    const opts = { message: 'm' };
    expect(ofValueField([5, opts])).toEqual([5, opts]);
  });
});

describe('ofArrayField', () => {
  it('treats a plain array as the value (not a tuple)', () => {
    const arr = [1, 2, 3];
    expect(ofArrayField(arr)).toEqual([arr, undefined]);
  });

  it('unwraps a [array, opts] tuple', () => {
    const arr = [1, 2];
    const opts = { label: 'L' };
    const result = ofArrayField([arr, opts]);
    expect(result[0]).toBe(arr);
    expect(result[1]).toBe(opts);
  });
});

describe('ofNestedField', () => {
  const T = createFieldSchemaDecoratorFactory(
    'T',
    (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(T, void 0, void 0),
    { phase: Phase.Type, message: '' },
  );

  it('passes through a single decorator', () => {
    const d = T();
    const [val, opts] = ofNestedField(d);
    expect(val).toBe(d);
    expect(opts).toBeUndefined();
  });

  it('passes through a decorator array as-is', () => {
    const arr = [T(), T()] as const;
    const [val, opts] = ofNestedField(arr);
    expect(val).toBe(arr);
    expect(opts).toBeUndefined();
  });

  it('unwraps [nested, ValidateOptions] tuple', () => {
    const d = T();
    const opts = { message: 'm' };
    const [val, resOpts] = ofNestedField([d, opts]);
    expect(val).toBe(d);
    expect(resOpts).toBe(opts);
  });
});

describe('createFieldSchemaDecoratorFactory', () => {
  it('attaches name (via FieldSchemaDecoratorName) and statics to the factory', () => {
    const decode = ({ value }: { value: unknown }) => typeof value === 'string';
    const toJsonSchema = () => ({ type: 'string' as const });

    const IsString = createFieldSchemaDecoratorFactory(
      'IsString',
      (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(IsString, void 0, void 0),
      {
        phase: Phase.Type,
        message: '.label must be a string',
        decode,
        toJsonSchema,
      },
    );

    expect(IsString[FieldSchemaDecoratorName]).toBe('IsString');
    expect(IsString.message).toBe('.label must be a string');
    expect(IsString.decode).toBe(decode);
    expect(IsString.toJsonSchema).toBe(toJsonSchema);
    expect(IsString.phase).toBe(Phase.Type);
    expect(typeof IsString).toBe('function');
  });

  it('factory call produces a decorator carrying metadata', () => {
    const MinLength = createFieldSchemaDecoratorFactory(
      'MinLength',
      (value: number): FieldSchemaDecorator<number> => FieldSchema(MinLength, value, void 0),
      {
        phase: Phase.Semantics,
        message: '.label must be at least .params chars',
        decode: ({ value, params }) => typeof value !== 'string' || value.length >= params,
      },
    );

    @Tag()
    class Foo {
      @MinLength(3)
      name!: string;
    }

    const entries = Metadata.ofField(FieldSchema, Foo, 'name' as keyof Foo);
    expect(entries).toBeDefined();
    expect(entries).toHaveLength(1);

    const meta = entries?.[0] as FieldSchemaDecoratorMetadata<number>;
    expect(meta.factory).toBe(MinLength);
    expect(meta.params).toBe(3);
    expect(meta.options).toBeUndefined();
  });

  it('supports a function-form `message`', () => {
    const Strict = createFieldSchemaDecoratorFactory(
      'Strict',
      (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(Strict, void 0, void 0),
      {
        phase: Phase.Type,
        message: ({ value }) => `got ${typeof value}`,
        decode: () => false,
      },
    );
    expect(typeof Strict.message).toBe('function');
  });
});

describe('FieldSchema', () => {
  it('stores `{factory, params, options}` on the decorator metadata', () => {
    const IsString = createFieldSchemaDecoratorFactory(
      'IsString',
      (
        params: { source?: string },
        options?: { message?: string },
      ): FieldSchemaDecorator<{ source?: string }> => FieldSchema(IsString, params, options),
      {
        phase: Phase.Type,
        message: '.label must be a string',
      },
    );

    const decorator = IsString({ source: 'inline' }, { message: 'override' });
    expect(decorator.metadata).toBeDefined();
    expect(decorator.metadata.factory).toBe(IsString);
    expect(decorator.metadata.params).toEqual({ source: 'inline' });
    expect(decorator.metadata.options).toEqual({ message: 'override' });
  });

  it('passes `extra` decorators as `self` so they apply alongside the main one', () => {
    const Marker = createFieldSchemaDecoratorFactory(
      'Marker',
      (tag: string): FieldSchemaDecorator<string> => FieldSchema(Marker, tag, void 0),
      { phase: Phase.Info, message: '' },
    );

    const Composite = createFieldSchemaDecoratorFactory(
      'Composite',
      (): FieldSchemaDecorator<undefined> =>
        FieldSchema<undefined>(Composite, void 0, void 0, [Marker('a'), Marker('b')]),
      { phase: Phase.Type, message: '' },
    );

    @Tag()
    class Foo {
      @Composite()
      name!: string;
    }

    const entries = Metadata.ofField(FieldSchema, Foo, 'name' as keyof Foo);
    expect(entries).toBeDefined();
    // Main + 2 extras = 3 metadata entries on the same field.
    expect(entries).toHaveLength(3);
    const factories = entries?.map((m) => (m as FieldSchemaDecoratorMetadata).factory);
    expect(factories).toContain(Composite);
    expect(factories).toContain(Marker);

    const markerEntries = entries?.filter(
      (m) => (m as FieldSchemaDecoratorMetadata).factory === Marker,
    ) as FieldSchemaDecoratorMetadata<string>[];
    expect(markerEntries.map((m) => m.params).sort()).toEqual(['a', 'b']);
  });

  it('multiple decorators on the same field stack', () => {
    const Tagger = createFieldSchemaDecoratorFactory(
      'Tagger',
      (n: number): FieldSchemaDecorator<number> => FieldSchema(Tagger, n, void 0),
      { phase: Phase.Info, message: '' },
    );

    @Tag()
    class Foo {
      @Tagger(1)
      @Tagger(2)
      name!: string;
    }

    const entries = Metadata.ofField(FieldSchema, Foo, 'name' as keyof Foo);
    expect(entries).toHaveLength(2);
    const params = (entries as readonly FieldSchemaDecoratorMetadata<number>[])
      .map((m) => m.params)
      .sort();
    expect(params).toEqual([1, 2]);
  });
});

describe('type guards', () => {
  const T = createFieldSchemaDecoratorFactory(
    'T',
    (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(T, void 0, void 0),
    { phase: Phase.Type, message: '' },
  );

  it('isFieldSchemaDecoratorFactory recognizes factories', () => {
    expect(isFieldSchemaDecoratorFactory(T)).toBe(true);
    expect(isFieldSchemaDecoratorFactory(() => null)).toBe(false);
    expect(isFieldSchemaDecoratorFactory({})).toBe(false);
    expect(isFieldSchemaDecoratorFactory(null)).toBe(false);
  });

  it('isFieldSchemaDecorator recognizes decorator instances', () => {
    const d = T();
    expect(isFieldSchemaDecorator(d)).toBe(true);
    expect(isFieldSchemaDecorator(T)).toBe(false); // factory, not decorator
    expect(isFieldSchemaDecorator(() => null)).toBe(false);
  });

  it('isFieldSchemaDecoratorMetadata recognizes raw metadata objects', () => {
    const d = T();
    expect(isFieldSchemaDecoratorMetadata(d.metadata)).toBe(true);
    expect(isFieldSchemaDecoratorMetadata({ factory: () => null, params: 1 })).toBe(false);
    expect(isFieldSchemaDecoratorMetadata({})).toBe(false);
  });
});

describe('getFieldSchema', () => {
  it('returns metadata map keyed by field name', () => {
    const Marker = createFieldSchemaDecoratorFactory(
      'Marker',
      (label: string): FieldSchemaDecorator<string> => FieldSchema(Marker, label, void 0),
      { phase: Phase.Info, message: '' },
    );

    @Tag()
    class Foo {
      @Marker('a')
      first!: string;

      @Marker('b')
      second!: string;
    }

    const map = getFieldSchema(Foo);
    expect(map).toBeDefined();
    expect(map?.size).toBe(2);
    const firstEntries = map?.get('first') as readonly FieldSchemaDecoratorMetadata<string>[];
    const secondEntries = map?.get('second') as readonly FieldSchemaDecoratorMetadata<string>[];
    expect(firstEntries[0].params).toBe('a');
    expect(secondEntries[0].params).toBe('b');
  });

  it('also works on instances (resolves via constructor)', () => {
    const Marker = createFieldSchemaDecoratorFactory(
      'Marker',
      (n: number): FieldSchemaDecorator<number> => FieldSchema(Marker, n, void 0),
      { phase: Phase.Info, message: '' },
    );

    @Tag()
    class Foo {
      @Marker(7)
      n!: number;
    }

    const inst = new Foo();
    const map = getFieldSchema(inst);
    expect(map?.get('n')?.[0]).toMatchObject({ params: 7 });
  });
});

describe('Dummy', () => {
  it('is a registered factory in Phase.Info with no decode', () => {
    expect(isFieldSchemaDecoratorFactory(Dummy)).toBe(true);
    expect(Dummy.phase).toBe(Phase.Info);
    expect(Dummy.message).toBe('');
    expect(Dummy.decode).toBeUndefined();
  });

  it('produces a decorator carrying its own factory in metadata', () => {
    const d = Dummy();
    expect(d.metadata.factory).toBe(Dummy);
    expect(d.metadata.params).toBeUndefined();
  });
});

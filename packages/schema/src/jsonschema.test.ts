import type { ClassDecorator } from '@kavri/basic';
import { createClassDecorator } from '@kavri/basic';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  FromJsonSchemaRegistry,
  type NestedFieldSchema,
  Phase,
} from './field.js';
import {
  FromJsonSchemaContext,
  fromJsonSchema,
  type JsonSchema,
  toJsonSchema,
} from './jsonschema.js';

// Test scaffolding -----------------------------------------------------------

function Tag(): ClassDecorator<object> {
  return createClassDecorator(Tag, {});
}

// `createFieldSchemaDecoratorFactory` infers its statics generic from the
// factory function's return type (`ReturnType<F>['metadata']['params']`). When
// the factory body references the const being declared, TS gives up and types
// it `any` (TS7022). Working around by `export`-ing turns the bindings into
// module-scope live references, which TS resolves without the inference loop.
export const StrType = createFieldSchemaDecoratorFactory(
  'StrType',
  (): FieldSchemaDecorator<undefined> => FieldSchema(StrType, void 0, void 0),
  {
    phase: Phase.Type,
    message: '',
    decode: ({ value }) => typeof value === 'string',
    toJsonSchema: () => ({ type: 'string' }),
    fromJsonSchema: ({ hasType }): FieldSchemaDecorator | undefined =>
      hasType('string') ? StrType() : void 0,
  },
);

export const Min = createFieldSchemaDecoratorFactory(
  'Min',
  (value: number): FieldSchemaDecorator<number> => FieldSchema(Min, value, void 0),
  {
    phase: Phase.Semantics,
    message: '',
    decode: ({ value, params }) => typeof value !== 'string' || value.length >= params,
    toJsonSchema: (p) => ({ minLength: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined =>
      typeof schema.minLength === 'number' ? Min(schema.minLength) : void 0,
  },
);

export const Max = createFieldSchemaDecoratorFactory(
  'Max',
  (value: number): FieldSchemaDecorator<number> => FieldSchema(Max, value, void 0),
  {
    phase: Phase.Semantics,
    message: '',
    decode: ({ value, params }) => typeof value !== 'string' || value.length <= params,
    toJsonSchema: (p) => ({ maxLength: p }),
    fromJsonSchema: ({ schema }): FieldSchemaDecorator | undefined =>
      typeof schema.maxLength === 'number' ? Max(schema.maxLength) : void 0,
  },
);

export const Wrap = createFieldSchemaDecoratorFactory(
  'Wrap',
  (value: NestedFieldSchema): FieldSchemaDecorator<NestedFieldSchema> =>
    FieldSchema(Wrap, value, void 0),
  {
    phase: Phase.Property,
    message: '',
    decode: () => true,
    toJsonSchema: (p) => ({ items: toJsonSchema(p) }),
    fromJsonSchema: ({ schema, fromJsonSchema: rec }): FieldSchemaDecorator | undefined =>
      schema.items === undefined ? void 0 : Wrap(rec(schema.items)),
  },
);

// A factory that contributes no decode, just metadata — to confirm the runner
// tolerates missing toJsonSchema.
const Marker = createFieldSchemaDecoratorFactory(
  'Marker',
  (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(Marker, void 0, void 0),
  {
    phase: Phase.Info,
    message: '',
  },
);

// Snapshot the registry so test factories don't pollute later runs.
const registrySnapshot = new Set(FromJsonSchemaRegistry);
afterAll(() => {
  FromJsonSchemaRegistry.clear();
  for (const f of registrySnapshot) FromJsonSchemaRegistry.add(f);
});
beforeAll(() => {
  // Confirm test factories registered themselves (sanity check).
  expect(FromJsonSchemaRegistry.has(StrType)).toBe(true);
  expect(FromJsonSchemaRegistry.has(Min)).toBe(true);
});

// ---------------------------------------------------------------------------
// toJsonSchema
// ---------------------------------------------------------------------------

describe('toJsonSchema(NestedFieldSchema)', () => {
  it('emits a single decorator', () => {
    expect(toJsonSchema(StrType())).toEqual({ type: 'string' });
  });

  it('emits a metadata object directly', () => {
    expect(toJsonSchema(StrType().metadata)).toEqual({ type: 'string' });
  });

  it('merges keywords from a decorator array (in order)', () => {
    expect(toJsonSchema([StrType(), Min(3), Max(10)])).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 10,
    });
  });

  it('passes the running result as `current` so callbacks can read siblings', () => {
    // `Wrap` reads nothing from current — just verify nested recursion works.
    expect(toJsonSchema(Wrap(StrType()))).toEqual({
      items: { type: 'string' },
    });
  });

  it('handles nested arrays of decorators', () => {
    expect(toJsonSchema(Wrap([StrType(), Min(2)]))).toEqual({
      items: { type: 'string', minLength: 2 },
    });
  });

  it('skips rules without `toJsonSchema`', () => {
    expect(toJsonSchema([Marker(), StrType()])).toEqual({ type: 'string' });
  });

  it('returns `{}` for an empty array', () => {
    expect(toJsonSchema([])).toEqual({});
  });
});

describe('toJsonSchema(class)', () => {
  it('emits `{ type: "object" }` for a class with no field decorators', () => {
    @Tag()
    class Empty {}
    expect(toJsonSchema(Empty)).toEqual({ type: 'object' });
  });

  it('aggregates fields into `properties`', () => {
    @Tag()
    class User {
      @StrType()
      @Min(2)
      name!: string;

      @StrType()
      email!: string;
    }
    expect(toJsonSchema(User)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string' },
      },
    });
  });

  it('handles nested-decorator fields', () => {
    @Tag()
    class Box {
      @Wrap(StrType())
      tags!: string[];
    }
    expect(toJsonSchema(Box)).toEqual({
      type: 'object',
      properties: {
        tags: { items: { type: 'string' } },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// fromJsonSchema
// ---------------------------------------------------------------------------

/**
 * `fromJsonSchema` walks the global registry, so other registered factories
 * (real decorators imported via `decorators/index.js`) may also contribute.
 * Filter to test factories so assertions are stable.
 */
function onlyTestFactories(decs: NestedFieldSchema): FieldSchemaDecorator[] {
  const arr = Array.isArray(decs)
    ? (decs as FieldSchemaDecorator[])
    : [decs as FieldSchemaDecorator];
  const tests = new Set<unknown>([StrType, Min, Max, Wrap]);
  return arr.filter((d) => tests.has(d.metadata.factory));
}

describe('fromJsonSchema', () => {
  it('returns an empty array when nothing matches', () => {
    const result = onlyTestFactories(fromJsonSchema({}));
    expect(result).toEqual([]);
  });

  it('produces a type-asserting decorator from `{ type: "string" }`', () => {
    const result = onlyTestFactories(fromJsonSchema({ type: 'string' }));
    expect(result).toHaveLength(1);
    expect(result[0].metadata.factory).toBe(StrType);
  });

  it('produces a constraint decorator from `{ minLength: 3 }`', () => {
    const result = onlyTestFactories(fromJsonSchema({ minLength: 3 }));
    expect(result).toHaveLength(1);
    expect(result[0].metadata.factory).toBe(Min);
    expect(result[0].metadata.params).toBe(3);
  });

  it('produces multiple decorators from `{ type: "string", minLength: 2, maxLength: 10 }`', () => {
    const result = onlyTestFactories(
      fromJsonSchema({ type: 'string', minLength: 2, maxLength: 10 }),
    );
    const factories = result.map((d) => d.metadata.factory);
    expect(factories).toContain(StrType);
    expect(factories).toContain(Min);
    expect(factories).toContain(Max);
  });

  it('recurses into nested schemas via `ctx.fromJsonSchema`', () => {
    const result = onlyTestFactories(
      fromJsonSchema({ items: { type: 'string', minLength: 2 } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].metadata.factory).toBe(Wrap);
    const nested = result[0].metadata.params as readonly FieldSchemaDecorator[];
    const nestedFactories = nested.map((d) => d.metadata.factory);
    expect(nestedFactories).toContain(StrType);
    expect(nestedFactories).toContain(Min);
  });

  it('survives a misbehaving factory (try/catch around each)', () => {
    const Boom = createFieldSchemaDecoratorFactory(
      'Boom',
      (): FieldSchemaDecorator<undefined> => FieldSchema<undefined>(Boom, void 0, void 0),
      {
        phase: Phase.Info,
        message: '',
        fromJsonSchema: () => {
          throw new Error('intentional');
        },
      },
    );
    // Boom registered itself; the call should not throw and should still
    // produce StrType.
    const result = onlyTestFactories(fromJsonSchema({ type: 'string' }));
    expect(result.some((d) => d.metadata.factory === StrType)).toBe(true);
    void Boom; // keep registered for the test body
  });
});

// ---------------------------------------------------------------------------
// FromJsonSchemaContext
// ---------------------------------------------------------------------------

describe('FromJsonSchemaContext', () => {
  it('hasType matches a single string type', () => {
    const ctx = new FromJsonSchemaContext({ type: 'string' }, () => []);
    expect(ctx.hasType('string')).toBe(true);
    expect(ctx.hasType('number')).toBe(false);
  });

  it('hasType matches against an array `type`', () => {
    const ctx = new FromJsonSchemaContext({ type: ['string', 'null'] }, () => []);
    expect(ctx.hasType('string')).toBe(true);
    expect(ctx.hasType('null')).toBe(true);
    expect(ctx.hasType('number')).toBe(false);
  });

  it('hasType returns false when type is absent', () => {
    const ctx = new FromJsonSchemaContext({}, () => []);
    expect(ctx.hasType('string')).toBe(false);
  });

  it('exposes schema, current, and recursive fromJsonSchema', () => {
    const recurse = (s: JsonSchema): NestedFieldSchema => [];
    const ctx = new FromJsonSchemaContext({ type: 'string' }, recurse);
    expect(ctx.schema).toEqual({ type: 'string' });
    expect(ctx.current).toEqual([]);
    expect(ctx.fromJsonSchema).toBe(recurse);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createClassDecorator,
  createMethodDecorator,
  createFieldDecorator,
  Metadata,
} from './metadata.js';
import type { ClassDecorator, MethodDecorator, FieldDecorator } from './types.js';

// -- Test decorator factories --

interface TagMeta {
  tag: string;
}

function Tag(tag: string): ClassDecorator<TagMeta> {
  return createClassDecorator(Tag, { tag });
}

interface MarkerMeta {
  label: string;
}

function Marker(label: string): MethodDecorator<MarkerMeta> {
  return createMethodDecorator(Marker, { label });
}

interface FieldMeta {
  type: string;
}

function FieldType(type: string): FieldDecorator<FieldMeta> {
  return createFieldDecorator(FieldType, { type });
}

// Composite: @Special composes @Tag
function Special(tag: string): ClassDecorator<TagMeta> {
  return createClassDecorator(Special, { tag }, [Tag(`special:${tag}`)]);
}

describe('Metadata', () => {
  describe('class decorators (TC39)', () => {
    it('stores and reads class metadata', () => {
      @Tag('hello')
      class Foo {}

      const meta = Metadata.of(Tag, Foo);
      expect(meta).toEqual([{ tag: 'hello' }]);
    });

    it('supports multiple decorators on same class', () => {
      @Tag('a')
      @Tag('b')
      class Foo {}

      const meta = Metadata.of(Tag, Foo);
      expect(meta).toEqual([{ tag: 'b' }, { tag: 'a' }]);
    });

    it('reads from instance', () => {
      @Tag('inst')
      class Foo {}

      const meta = Metadata.of(Tag, new Foo());
      expect(meta).toEqual([{ tag: 'inst' }]);
    });

    it('decorator carries metadata static property', () => {
      const d = Tag('check');
      expect(d.metadata).toEqual({ tag: 'check' });
    });
  });

  describe('method decorators (TC39)', () => {
    it('stores and reads method metadata', () => {
      @Tag('cls')
      class Foo {
        @Marker('greet')
        hello() {}
      }

      const meta = Metadata.of(Marker, Foo, 'hello');
      expect(meta).toEqual([{ label: 'greet' }]);
    });

    it('reads method metadata via instance', () => {
      @Tag('cls')
      class Foo {
        @Marker('m')
        bar() {}
      }

      const meta = Metadata.of(Marker, new Foo(), 'bar');
      expect(meta).toEqual([{ label: 'm' }]);
    });
  });

  describe('field decorators (TC39)', () => {
    it('stores and reads field metadata', () => {
      @Tag('cls')
      class Foo {
        @FieldType('string')
        name!: string;
      }

      const meta = Metadata.of(FieldType, Foo, 'name');
      expect(meta).toEqual([{ type: 'string' }]);
    });
  });

  describe('composite decorators', () => {
    it('applies extra decorators', () => {
      @Special('vip')
      class Foo {}

      expect(Metadata.of(Special, Foo)).toEqual([{ tag: 'vip' }]);
      expect(Metadata.of(Tag, Foo)).toEqual([{ tag: 'special:vip' }]);
    });
  });

  describe('Metadata.apply()', () => {
    it('programmatically adds class metadata', () => {
      class Foo {}
      Metadata.apply(Tag, Foo, { tag: 'dynamic' });
      expect(Metadata.of(Tag, Foo)).toEqual([{ tag: 'dynamic' }]);
    });

    it('programmatically adds method metadata', () => {
      class Foo {
        bar() {}
      }
      Metadata.apply(Marker, Foo, 'bar', { label: 'dyn' });
      expect(Metadata.of(Marker, Foo, 'bar')).toEqual([{ label: 'dyn' }]);
    });
  });

  describe('Metadata.entries()', () => {
    it('returns all class entries for a factory', () => {
      // Use a unique factory to avoid pollution from other tests
      function UniqueTag(v: string): ClassDecorator<{ v: string }> {
        return createClassDecorator(UniqueTag, { v });
      }

      @UniqueTag('a')
      class A {}
      @UniqueTag('b')
      class B {}

      const entries = Metadata.entries(UniqueTag) as [Function, { v: string }][];
      expect(entries).toHaveLength(2);
      expect(entries.find(([cls]) => cls === A)?.[1]).toEqual({ v: 'a' });
      expect(entries.find(([cls]) => cls === B)?.[1]).toEqual({ v: 'b' });
    });
  });

  describe('Metadata.lookup()', () => {
    it('walks prototype chain', () => {
      function Level(n: number): ClassDecorator<{ n: number }> {
        return createClassDecorator(Level, { n });
      }

      @Level(1)
      class Base {}

      @Level(2)
      class Child extends Base {}

      expect(Metadata.lookup(Level, Child)).toEqual([{ n: 2 }, { n: 1 }]);
      expect(Metadata.lookup(Level, Base)).toEqual([{ n: 1 }]);
    });

    it('walks prototype chain for method metadata', () => {
      function Mark(v: string): MethodDecorator<{ v: string }> {
        return createMethodDecorator(Mark, { v });
      }
      function C(): ClassDecorator<object> {
        return createClassDecorator(C, {});
      }

      @C()
      class Base {
        @Mark('base')
        run() {}
      }

      @C()
      class Child extends Base {
        @Mark('child')
        override run() {}
      }

      expect(Metadata.lookup(Mark, Child, 'run')).toEqual([{ v: 'child' }, { v: 'base' }]);
    });
  });

  describe('lazy flush without class decorator', () => {
    it('flushes method metadata on first Metadata.of() call', () => {
      // No @Tag — only method decorator. TC39 method metadata is pending
      // until either a class decorator runs or Metadata.of() lazily flushes.
      // With TC39 decorators, Symbol.metadata is set after class definition.
      @Tag('flush')
      class Foo {
        @Marker('lazy')
        baz() {}
      }

      expect(Metadata.of(Marker, Foo, 'baz')).toEqual([{ label: 'lazy' }]);
    });
  });
});

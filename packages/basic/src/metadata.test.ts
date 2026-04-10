import { describe, it, expect } from 'vitest';
import { MetadataManager } from './metadata.js';
import type { ClassDecorator, MethodDecorator, FieldDecorator } from './types.js';

// Use a fresh store per test file to avoid cross-test pollution
const Metadata = new MetadataManager();

// -- Bound convenience aliases (same pattern as index.ts) --
const createClassDecorator = Metadata.createClassDecorator.bind(Metadata);
const createMethodDecorator = Metadata.createMethodDecorator.bind(Metadata);
const createFieldDecorator = Metadata.createFieldDecorator.bind(Metadata);

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

function Special(tag: string): ClassDecorator<TagMeta> {
  return createClassDecorator(Special, { tag }, [Tag(`special:${tag}`)]);
}

describe('createClassDecorator', () => {
  it('stores and reads class metadata', () => {
    @Tag('hello')
    class Foo {}
    expect(Metadata.of(Tag, Foo)).toEqual([{ tag: 'hello' }]);
  });

  it('supports multiple decorators on same class', () => {
    @Tag('a')
    @Tag('b')
    class Foo {}
    expect(Metadata.of(Tag, Foo)).toEqual([{ tag: 'b' }, { tag: 'a' }]);
  });

  it('reads from instance', () => {
    @Tag('inst')
    class Foo {}
    expect(Metadata.of(Tag, new Foo())).toEqual([{ tag: 'inst' }]);
  });

  it('decorator carries metadata static property', () => {
    const d = Tag('check');
    expect(d.metadata).toEqual({ tag: 'check' });
  });

  it('metadata property is readonly', () => {
    const d = Tag('ro');
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (d as any).metadata = 'changed';
    }).toThrow();
  });

  it('returns empty array for undecorated class', () => {
    class Bare {}
    expect(Metadata.of(Tag, Bare)).toEqual([]);
  });
});

describe('createMethodDecorator', () => {
  it('stores and reads method metadata', () => {
    @Tag('cls')
    class Foo {
      @Marker('greet')
      hello() {}
    }
    expect(Metadata.of(Marker, Foo, 'hello')).toEqual([{ label: 'greet' }]);
  });

  it('reads method metadata via instance', () => {
    @Tag('cls')
    class Foo {
      @Marker('m')
      bar() {}
    }
    expect(Metadata.of(Marker, new Foo(), 'bar')).toEqual([{ label: 'm' }]);
  });

  it('returns empty for undecorated method', () => {
    @Tag('cls')
    class Foo {
      bar() {}
    }
    expect(Metadata.of(Marker, Foo, 'bar')).toEqual([]);
  });

  it('returns empty for nonexistent method key', () => {
    @Tag('cls')
    class Foo {
      @Marker('x')
      bar() {}
    }
    expect(Metadata.of(Marker, Foo, 'nonexistent')).toEqual([]);
  });

  it('decorator carries metadata static property', () => {
    const d = Marker('prop');
    expect(d.metadata).toEqual({ label: 'prop' });
  });
});

describe('createFieldDecorator', () => {
  it('stores and reads field metadata', () => {
    @Tag('cls')
    class Foo {
      @FieldType('string')
      name!: string;
    }
    expect(Metadata.of(FieldType, Foo, 'name')).toEqual([{ type: 'string' }]);
  });

  it('multiple field decorators on same field', () => {
    @Tag('cls')
    class Foo {
      @FieldType('a')
      @FieldType('b')
      name!: string;
    }
    expect(Metadata.of(FieldType, Foo, 'name')).toEqual([{ type: 'b' }, { type: 'a' }]);
  });

  it('decorator carries metadata static property', () => {
    const d = FieldType('num');
    expect(d.metadata).toEqual({ type: 'num' });
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

  it('appends to existing metadata (push semantics)', () => {
    class Foo {}
    Metadata.apply(Tag, Foo, { tag: 'first' });
    Metadata.apply(Tag, Foo, { tag: 'second' });
    expect(Metadata.of(Tag, Foo)).toEqual([{ tag: 'first' }, { tag: 'second' }]);
  });
});

describe('Metadata.entries()', () => {
  it('returns all class entries for a factory', () => {
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

  it('returns all method entries for a factory', () => {
    function UniqueMark(v: string): MethodDecorator<{ v: string }> {
      return createMethodDecorator(UniqueMark, { v });
    }
    @Tag('cls')
    class A {
      @UniqueMark('x')
      foo() {}
    }
    @Tag('cls')
    class B {
      @UniqueMark('y')
      bar() {}
    }

    const entries = Metadata.entries(UniqueMark) as [Function, string, { v: string }][];
    expect(entries).toHaveLength(2);
    expect(entries.find(([cls]) => cls === A)).toEqual([A, 'foo', { v: 'x' }]);
    expect(entries.find(([cls]) => cls === B)).toEqual([B, 'bar', { v: 'y' }]);
  });

  it('returns empty array for unknown factory', () => {
    function Unknown(): ClassDecorator<object> {
      return createClassDecorator(Unknown, {});
    }
    expect(Metadata.entries(Unknown)).toEqual([]);
  });
});

describe('Metadata.lookup()', () => {
  it('walks prototype chain for class metadata', () => {
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

  it('returns empty for undecorated class', () => {
    function L(): ClassDecorator<object> {
      return createClassDecorator(L, {});
    }
    class Bare {}
    expect(Metadata.lookup(L, Bare)).toEqual([]);
  });
});

describe('extra method/field decorators', () => {
  it('composes extra method decorators', () => {
    function Log(msg: string): MethodDecorator<{ msg: string }> {
      return createMethodDecorator(Log, { msg });
    }
    function Traced(msg: string): MethodDecorator<{ msg: string }> {
      return createMethodDecorator(Traced, { msg }, [Log(`traced:${msg}`)]);
    }
    @Tag('cls')
    class Foo {
      @Traced('hello')
      run() {}
    }
    expect(Metadata.of(Traced, Foo, 'run')).toEqual([{ msg: 'hello' }]);
    expect(Metadata.of(Log, Foo, 'run')).toEqual([{ msg: 'traced:hello' }]);
  });

  it('composes extra field decorators', () => {
    function Required(): FieldDecorator<{ required: true }> {
      return createFieldDecorator(Required, { required: true as const });
    }
    function TypedField(type: string): FieldDecorator<FieldMeta> {
      return createFieldDecorator(TypedField, { type }, [Required()]);
    }
    @Tag('cls')
    class Foo {
      @TypedField('string')
      name!: string;
    }
    expect(Metadata.of(TypedField, Foo, 'name')).toEqual([{ type: 'string' }]);
    expect(Metadata.of(Required, Foo, 'name')).toEqual([{ required: true }]);
  });
});

describe('MetadataManager isolation', () => {
  it('separate stores are independent', () => {
    const store1 = new MetadataManager();
    const store2 = new MetadataManager();

    function Tag1(v: string): ClassDecorator<{ v: string }> {
      return store1.createClassDecorator(Tag1, { v });
    }

    @Tag1('a')
    class Foo {}

    expect(store1.of(Tag1, Foo)).toEqual([{ v: 'a' }]);
    expect(store2.of(Tag1, Foo)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Legacy (experimentalDecorators) protocol tests
//
// These call decorator functions manually with legacy signatures to exercise
// the legacy code paths without needing a different compiler.
// Legacy class decorator:  (target) → void
// Legacy method decorator: (target.prototype, key, descriptor) → void
// Legacy field decorator:  (target.prototype, key) → void
// ---------------------------------------------------------------------------

describe('legacy decorator protocol', () => {
  // Fresh store to isolate from TC39 tests
  const LM = new MetadataManager();
  const lcd = LM.createClassDecorator.bind(LM);
  const lmd = LM.createMethodDecorator.bind(LM);
  const lfd = LM.createFieldDecorator.bind(LM);

  function LTag(tag: string): ClassDecorator<TagMeta> {
    return lcd(LTag, { tag });
  }
  function LMarker(label: string): MethodDecorator<MarkerMeta> {
    return lmd(LMarker, { label });
  }
  function LField(type: string): FieldDecorator<FieldMeta> {
    return lfd(LField, { type });
  }

  describe('class decorators (legacy)', () => {
    it('stores and reads class metadata', () => {
      class Foo {}
      LTag('hello')(Foo);
      expect(LM.of(LTag, Foo)).toEqual([{ tag: 'hello' }]);
    });

    it('supports multiple decorators', () => {
      class Foo {}
      LTag('a')(Foo);
      LTag('b')(Foo);
      expect(LM.of(LTag, Foo)).toEqual([{ tag: 'a' }, { tag: 'b' }]);
    });

    it('reads from instance', () => {
      class Foo {}
      LTag('inst')(Foo);
      expect(LM.of(LTag, new Foo())).toEqual([{ tag: 'inst' }]);
    });
  });

  describe('method decorators (legacy)', () => {
    it('stores and reads method metadata', () => {
      class Foo {
        hello() {}
      }
      LTag('cls')(Foo);
      const desc = Object.getOwnPropertyDescriptor(Foo.prototype, 'hello') as PropertyDescriptor;
      LMarker('greet')(Foo.prototype, 'hello', desc);
      expect(LM.of(LMarker, Foo, 'hello')).toEqual([{ label: 'greet' }]);
    });

    it('reads via instance', () => {
      class Foo {
        bar() {}
      }
      const desc = Object.getOwnPropertyDescriptor(Foo.prototype, 'bar') as PropertyDescriptor;
      LMarker('m')(Foo.prototype, 'bar', desc);
      expect(LM.of(LMarker, new Foo(), 'bar')).toEqual([{ label: 'm' }]);
    });
  });

  describe('field decorators (legacy)', () => {
    it('stores and reads field metadata', () => {
      class Foo {
        name!: string;
      }
      LTag('cls')(Foo);
      LField('string')(Foo.prototype, 'name');
      expect(LM.of(LField, Foo, 'name')).toEqual([{ type: 'string' }]);
    });
  });

  describe('composite decorators (legacy)', () => {
    it('applies extra class decorators', () => {
      function LSpecial(tag: string): ClassDecorator<TagMeta> {
        return lcd(LSpecial, { tag }, [LTag(`special:${tag}`)]);
      }
      class Foo {}
      LSpecial('vip')(Foo);
      expect(LM.of(LSpecial, Foo)).toEqual([{ tag: 'vip' }]);
      expect(LM.of(LTag, Foo)).toEqual([{ tag: 'special:vip' }]);
    });

    it('applies extra method decorators', () => {
      function LLog(msg: string): MethodDecorator<{ msg: string }> {
        return lmd(LLog, { msg });
      }
      function LTraced(msg: string): MethodDecorator<{ msg: string }> {
        return lmd(LTraced, { msg }, [LLog(`traced:${msg}`)]);
      }
      class Foo {
        run() {}
      }
      const desc = Object.getOwnPropertyDescriptor(Foo.prototype, 'run') as PropertyDescriptor;
      LTraced('hello')(Foo.prototype, 'run', desc);
      expect(LM.of(LTraced, Foo, 'run')).toEqual([{ msg: 'hello' }]);
      expect(LM.of(LLog, Foo, 'run')).toEqual([{ msg: 'traced:hello' }]);
    });

    it('applies extra field decorators', () => {
      function LRequired(): FieldDecorator<{ required: true }> {
        return lfd(LRequired, { required: true as const });
      }
      function LTyped(type: string): FieldDecorator<FieldMeta> {
        return lfd(LTyped, { type }, [LRequired()]);
      }
      class Foo {
        name!: string;
      }
      LTyped('string')(Foo.prototype, 'name');
      expect(LM.of(LTyped, Foo, 'name')).toEqual([{ type: 'string' }]);
      expect(LM.of(LRequired, Foo, 'name')).toEqual([{ required: true }]);
    });
  });

  describe('lookup (legacy)', () => {
    it('walks prototype chain', () => {
      function LLevel(n: number): ClassDecorator<{ n: number }> {
        return lcd(LLevel, { n });
      }
      class Base {}
      LLevel(1)(Base);
      class Child extends Base {}
      LLevel(2)(Child);
      expect(LM.lookup(LLevel, Child)).toEqual([{ n: 2 }, { n: 1 }]);
    });
  });

  describe('static method decorators (legacy)', () => {
    it('stores metadata on constructor for static methods', () => {
      class Foo {
        static bar() {}
      }
      const desc = Object.getOwnPropertyDescriptor(Foo, 'bar') as PropertyDescriptor;
      // For static methods, legacy target is the constructor itself
      LMarker('static')(Foo, 'bar', desc);
      expect(LM.of(LMarker, Foo, 'bar')).toEqual([{ label: 'static' }]);
    });
  });
});

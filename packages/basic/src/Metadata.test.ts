import { describe, expect, it } from 'vitest';
import { MetadataManager } from './Metadata.js';
import type {
  AnyConstructor,
  ClassDecorator,
  FieldDecorator,
  MethodDecorator,
  MethodDecoratorFactory,
} from './types.js';

const Metadata = new MetadataManager();
const createClassDecorator = Metadata.createClassDecorator.bind(Metadata);
const createMethodDecorator = Metadata.createMethodDecorator.bind(Metadata);
const createFieldDecorator = Metadata.createFieldDecorator.bind(Metadata);

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
  return createClassDecorator(Special, { tag }, { self: [Tag(`special:${tag}`)] });
}

describe('class decorators (TC39)', () => {
  it('stores and reads class metadata', () => {
    @Tag('hello')
    class Foo {}

    const entries = Metadata.ofClass(Tag, Foo);
    expect(entries).toHaveLength(1);
    expect(entries?.[0]).toEqual({ tag: 'hello' });
  });

  it('supports multiple decorators', () => {
    @Tag('a')
    @Tag('b')
    class Foo {}

    const entries = Metadata.ofClass(Tag, Foo);
    expect(entries).toHaveLength(2);
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

  it('returns undefined for undecorated class', () => {
    class Bare {}

    expect(Metadata.ofClass(Tag, Bare)).toBeUndefined();
  });
});

describe('method decorators (TC39)', () => {
  it('stores and reads method metadata', () => {
    @Tag('cls')
    class Foo {
      @Marker('greet')
      hello() {}
    }

    const entries = Metadata.ofMethod(Marker, Foo, 'hello' as keyof Foo);
    expect(entries).toHaveLength(1);
    expect(entries?.[0]).toEqual({ label: 'greet' });
  });

  it('returns undefined for undecorated method', () => {
    @Tag('cls')
    class Foo {
      bar() {}
    }

    expect(Metadata.ofMethod(Marker, Foo, 'bar' as keyof Foo)).toBeUndefined();
  });
});

describe('field decorators (TC39)', () => {
  it('stores and reads field metadata', () => {
    @Tag('cls')
    class Foo {
      @FieldType('string')
      name!: string;
    }

    const entries = Metadata.ofField(FieldType, Foo, 'name' as keyof Foo);
    expect(entries).toHaveLength(1);
    expect(entries?.[0]).toEqual({ type: 'string' });
  });
});

describe('composite decorators', () => {
  it('applies extra decorators', () => {
    @Special('vip')
    class Foo {}

    expect(Metadata.ofClass(Special, Foo)).toHaveLength(1);
    expect(Metadata.ofClass(Tag, Foo)).toHaveLength(1);
    expect(Metadata.ofClass(Tag, Foo)?.[0]?.tag).toBe('special:vip');
  });
});

describe('ofClass() global', () => {
  it('returns all classes for a factory', () => {
    function U(v: string): ClassDecorator<{ v: string }> {
      return createClassDecorator(U, { v });
    }

    @U('a')
    class A {}

    @U('b')
    class B {}

    const all = Metadata.ofClass(U);
    expect(all?.get(A)).toHaveLength(1);
    expect(all?.get(B)).toHaveLength(1);
  });
});

describe('subclassesOf', () => {
  it('finds decorated subclasses', () => {
    function C(): ClassDecorator<object> {
      return createClassDecorator(C, {});
    }

    class Base {}

    @C()
    class Child extends Base {}

    @C()
    class GrandChild extends Child {}

    expect(Metadata.subclassesOf(C, Base)).toContain(Child);
    expect(Metadata.subclassesOf(C, Base)).toContain(GrandChild);
    expect(Metadata.subclassesOf(C, Child)).toContain(GrandChild);
  });
});

describe('ComposeOptions', () => {
  it('classes option applies class decorator from method decorator', () => {
    function Inject(
      ...injectables: AnyConstructor[]
    ): ClassDecorator<{ injectables: AnyConstructor[] }> {
      return createClassDecorator(Inject, { injectables });
    }

    function NeedsService(): MethodDecorator<object> {
      return createMethodDecorator(
        NeedsService,
        {},
        {
          classes: [Inject(Date)],
        },
      );
    }

    @Tag('cls')
    class Foo {
      @NeedsService()
      doWork() {}
    }

    const useEntries = Metadata.ofClass(Inject, Foo);
    expect(useEntries).toHaveLength(1);
    expect(useEntries?.[0]?.injectables).toContain(Date);
  });

  it('proxyMethod wraps the method (legacy)', () => {
    const calls: string[] = [];

    function Logged(): MethodDecorator<object> {
      return createMethodDecorator(
        Logged,
        {},
        {
          proxyMethod: (original) => {
            return function (this: unknown, ...args: unknown[]) {
              calls.push('before');
              const result = original.apply(this, args);
              calls.push('after');
              return result;
            };
          },
        },
      );
    }

    class Svc {
      @Logged()
      run() {
        calls.push('run');
        return 42;
      }
    }

    const svc = new Svc();
    expect(svc.run()).toBe(42);
    expect(calls).toEqual(['before', 'run', 'after']);
  });
});

describe('legacy decorator protocol', () => {
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

  it('class decorator (legacy)', () => {
    class Foo {}

    LTag('hello')(Foo);
    expect(LM.ofClass(LTag, Foo)).toHaveLength(1);
  });

  it('method decorator (legacy)', () => {
    class Foo {
      hello() {}
    }

    LTag('cls')(Foo);
    const desc = Object.getOwnPropertyDescriptor(Foo.prototype, 'hello') as PropertyDescriptor;
    LMarker('greet')(Foo.prototype, 'hello', desc);
    expect(LM.ofMethod(LMarker, Foo, 'hello' as keyof Foo)).toHaveLength(1);
  });

  it('field decorator (legacy)', () => {
    class Foo {
      name!: string;
    }

    LTag('cls')(Foo);
    (LField('string') as (target: object, key: string) => void)(Foo.prototype, 'name');
    expect(LM.ofField(LField, Foo, 'name' as keyof Foo)).toHaveLength(1);
  });
});

describe('proxyMethod decorator pattern', () => {
  it('createAspectDecorator composes Use + method metadata', () => {
    const AM = new MetadataManager();

    function Inject(
      ...injectables: AnyConstructor[]
    ): ClassDecorator<{ injectables: AnyConstructor[] }> {
      return AM.createClassDecorator(Inject, { injectables });
    }

    abstract class Aspect<T> {
      abstract aspect(
        metadata: T,
        instance: object,
        method: (...args: unknown[]) => unknown,
        args: unknown[],
      ): unknown;
    }

    class TransactionalAspect extends Aspect<undefined> {
      aspect(_m: undefined, _i: object, method: (...args: unknown[]) => unknown, args: unknown[]) {
        return method(...args);
      }
    }

    function createAspectDecorator<T>(
      factory: MethodDecoratorFactory<T>,
      metadata: T,
      AspectClass: AnyConstructor<Aspect<T>>,
    ) {
      return AM.createMethodDecorator(factory, metadata, {
        classes: [Inject(AspectClass)],
      });
    }

    function Transactional(): MethodDecorator<undefined> {
      return createAspectDecorator(Transactional, undefined as never, TransactionalAspect);
    }

    @AM.createClassDecorator(Tag, { tag: 'svc' })
    class UserService {
      @Transactional()
      createUser() {}
    }

    expect(AM.ofClass(Inject, UserService)).toHaveLength(1);
    expect(AM.ofClass(Inject, UserService)?.[0]?.injectables).toContain(TransactionalAspect);
    expect(AM.ofMethod(Transactional, UserService, 'createUser')).toHaveLength(1);
  });
});

describe('MetadataManager isolation', () => {
  it('separate managers are independent', () => {
    const m1 = new MetadataManager();
    const m2 = new MetadataManager();

    function T1(v: string): ClassDecorator<{ v: string }> {
      return m1.createClassDecorator(T1, { v });
    }

    @T1('a')
    class Foo {}

    expect(m1.ofClass(T1, Foo)).toHaveLength(1);
    expect(m2.ofClass(T1, Foo)).toBeUndefined();
  });
});

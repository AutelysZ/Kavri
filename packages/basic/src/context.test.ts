import { describe, expect, it } from 'vitest';
import { AsyncScope, Key } from './context.js';

describe('Key', () => {
  it('creates keys via static factory', () => {
    const k = Key.of<string>('test');
    expect(k.name).toBe('test');
  });

  it('name is undefined when not provided', () => {
    const k = Key.of<string>();
    expect(k.name).toBeUndefined();
  });

  it('each key is unique', () => {
    const k1 = Key.of<string>('same');
    const k2 = Key.of<string>('same');
    expect(k1).not.toBe(k2);
  });
});

describe('Context', () => {
  it('has/get/set', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    expect(ctx.has(K)).toBe(false);
    expect(ctx.get(K)).toBeUndefined();
    ctx.set(K, 'hello');
    expect(ctx.has(K)).toBe(true);
    expect(ctx.get(K)).toBe('hello');
  });

  it('set returns this for chaining', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const A = Key.of<number>('a');
    const B = Key.of<number>('b');
    ctx.set(A, 1).set(B, 2);
    expect(ctx.get(A)).toBe(1);
    expect(ctx.get(B)).toBe(2);
  });

  it('set(key, undefined) is distinguishable from absence', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string | undefined>('k');
    expect(ctx.has(K)).toBe(false);
    ctx.set(K, undefined);
    expect(ctx.has(K)).toBe(true);
    expect(ctx.get(K)).toBeUndefined();
  });

  it('delete removes own entry, returns boolean', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'val');
    expect(ctx.delete(K)).toBe(true);
    expect(ctx.has(K)).toBe(false);
    expect(ctx.delete(K)).toBe(false);
  });

  it('getOrThrow throws when absent', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('missing');
    expect(() => ctx.getOrThrow(K)).toThrow('"missing" is not set');
  });

  it('getOrThrow throws with (unnamed) for unnamed key', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>();
    expect(() => ctx.getOrThrow(K)).toThrow('"(unnamed)" is not set');
  });

  it('getOrThrow returns value when present', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<number>('v');
    ctx.set(K, 42);
    expect(ctx.getOrThrow(K)).toBe(42);
  });

  it('getOrInsert inserts on miss', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<number>('k');
    expect(ctx.getOrInsert(K, 42)).toBe(42);
    expect(ctx.get(K)).toBe(42);
    expect(ctx.getOrInsert(K, 99)).toBe(42); // cached
  });

  it('getOrInsertComputed inserts on miss', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<number>('k');
    expect(ctx.getOrInsertComputed(K, () => 42)).toBe(42);
    expect(ctx.get(K)).toBe(42);
    expect(ctx.getOrInsertComputed(K, () => 99)).toBe(42); // cached
  });

  it('getOrInsertComputed passes key to callback', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('mykey');
    ctx.getOrInsertComputed(K, (k) => `computed:${k.name}`);
    expect(ctx.get(K)).toBe('computed:mykey');
  });
});

describe('Context.extend()', () => {
  it('child inherits parent values', () => {
    const scope = new AsyncScope();
    const parent = scope.create();
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = parent.extend();
    expect(child.has(K)).toBe(true);
    expect(child.get(K)).toBe('parent');
  });

  it('child set does not affect parent', () => {
    const scope = new AsyncScope();
    const parent = scope.create();
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = parent.extend();
    child.set(K, 'child');
    expect(child.get(K)).toBe('child');
    expect(parent.get(K)).toBe('parent');
  });

  it('child delete restores parent visibility', () => {
    const scope = new AsyncScope();
    const parent = scope.create();
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = parent.extend();
    child.set(K, 'child');
    child.delete(K);
    expect(child.get(K)).toBe('parent');
  });

  it('delete on child without own entry does not affect parent', () => {
    const scope = new AsyncScope();
    const parent = scope.create();
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = parent.extend();
    child.delete(K); // no own entry
    expect(child.has(K)).toBe(true);
    expect(child.get(K)).toBe('parent');
  });

  it('getOrInsert uses parent value', () => {
    const scope = new AsyncScope();
    const parent = scope.create();
    const K = Key.of<number>('k');
    parent.set(K, 1);
    const child = parent.extend();
    expect(child.getOrInsert(K, 99)).toBe(1);
  });
});

describe('AsyncScope', () => {
  it('isActive reflects scope state', async () => {
    const scope = new AsyncScope();
    expect(scope.isActive()).toBe(false);
    await scope.run((ctx) => {
      expect(scope.isActive()).toBe(true);
      expect(ctx.isActive()).toBe(true);
    });
    expect(scope.isActive()).toBe(false);
  });

  it('run provides context to fn', async () => {
    const scope = new AsyncScope();
    const K = Key.of<string>('k');
    await scope.run((ctx) => {
      ctx.set(K, 'hello');
      expect(ctx.get(K)).toBe('hello');
    });
  });

  it('run reuses active scope', async () => {
    const scope = new AsyncScope();
    const K = Key.of<string>('k');
    await scope.run(async (ctx) => {
      ctx.set(K, 'outer');
      await scope.run((inner) => {
        expect(inner).toBe(ctx); // same context
        expect(inner.get(K)).toBe('outer');
      });
    });
  });

  it('run with state enters ALS with that state', async () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'pre-set');
    await scope.run((active) => {
      expect(active).toBe(ctx);
      expect(active.get(K)).toBe('pre-set');
    }, ctx);
  });

  it('run with mismatched state throws', async () => {
    const scope = new AsyncScope();
    const other = scope.create();
    await scope.run(async () => {
      await expect(scope.run(() => {}, other)).rejects.toThrow('does not match active scope');
    });
  });

  it('fork creates child context', async () => {
    const scope = new AsyncScope();
    const K = Key.of<string>('k');
    await scope.run(async (ctx) => {
      ctx.set(K, 'parent');
      await scope.fork((child) => {
        expect(child).not.toBe(ctx);
        expect(child.get(K)).toBe('parent');
        child.set(K, 'child');
        expect(child.get(K)).toBe('child');
      });
      expect(ctx.get(K)).toBe('parent');
    });
  });

  it('fork with mismatched state throws', async () => {
    const scope = new AsyncScope();
    const other = scope.create();
    await scope.run(async () => {
      await expect(scope.fork(() => {}, other)).rejects.toThrow('does not match active scope');
    });
  });

  it('fork outside scope creates root + child', async () => {
    const scope = new AsyncScope();
    const K = Key.of<string>('k');
    await scope.fork((ctx) => {
      ctx.set(K, 'value');
      expect(ctx.get(K)).toBe('value');
    });
  });

  it('enter creates scope imperatively', () => {
    const scope = new AsyncScope();
    expect(scope.isActive()).toBe(false);
    scope.enter();
    expect(scope.isActive()).toBe(true);
    const K = Key.of<number>('k');
    scope.set(K, 42);
    expect(scope.get(K)).toBe(42);
  });

  it('enter with state', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'pre');
    scope.enter(ctx);
    expect(scope.get(K)).toBe('pre');
  });

  it('enter is no-op when already active', async () => {
    const scope = new AsyncScope();
    await scope.run((ctx) => {
      scope.enter(); // no-op
      const K = Key.of<number>('k');
      ctx.set(K, 1);
      expect(scope.get(K)).toBe(1);
    });
  });

  it('enter with mismatched state throws', async () => {
    const scope = new AsyncScope();
    const other = scope.create();
    await scope.run(() => {
      expect(() => scope.enter(other)).toThrow('does not match active scope');
    });
  });

  it('delegated state methods throw when not active', () => {
    const scope = new AsyncScope();
    const K = Key.of<string>('k');
    expect(() => scope.has(K)).toThrow('Not in AsyncScope');
    expect(() => scope.get(K)).toThrow('Not in AsyncScope');
    expect(() => scope.getOrThrow(K)).toThrow('Not in AsyncScope');
    expect(() => scope.getOrInsert(K, 'v')).toThrow('Not in AsyncScope');
    expect(() => scope.getOrInsertComputed(K, () => 'v')).toThrow('Not in AsyncScope');
    expect(() => scope.set(K, 'v')).toThrow('Not in AsyncScope');
    expect(() => scope.delete(K)).toThrow('Not in AsyncScope');
  });

  it('delegated set returns this for chaining', async () => {
    const scope = new AsyncScope();
    const A = Key.of<number>('a');
    const B = Key.of<number>('b');
    await scope.run(() => {
      scope.set(A, 1).set(B, 2);
      expect(scope.get(A)).toBe(1);
      expect(scope.get(B)).toBe(2);
    });
  });

  it('create returns detached context', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'detached');
    expect(ctx.get(K)).toBe('detached');
    expect(scope.isActive()).toBe(false); // not in ALS
  });

  it('run returns value from fn', async () => {
    const scope = new AsyncScope();
    expect(await scope.run(() => 42)).toBe(42);
  });

  it('fork returns value from fn', async () => {
    const scope = new AsyncScope();
    const result = await scope.run(async () => scope.fork(() => 'forked'));
    expect(result).toBe('forked');
  });

  it('Context.run delegates to owning scope', async () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'pre');
    await ctx.run((active) => {
      expect(active).toBe(ctx);
      expect(scope.isActive()).toBe(true);
      expect(active.get(K)).toBe('pre');
    });
  });

  it('Context.fork delegates to owning scope', async () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    const K = Key.of<string>('k');
    ctx.set(K, 'parent');
    await ctx.fork((child) => {
      expect(child).not.toBe(ctx);
      expect(child.get(K)).toBe('parent');
    });
  });

  it('Context.enter delegates to owning scope', () => {
    const scope = new AsyncScope();
    const ctx = scope.create();
    ctx.enter();
    expect(scope.isActive()).toBe(true);
  });

  it('lazy ALS initialization', () => {
    const scope = new AsyncScope();
    expect(scope.isActive()).toBe(false);
    // No ALS created until first scope entry
    const ctx = scope.create();
    expect(ctx.has(Key.of('x'))).toBe(false);
  });

  it('nested forks create chain', async () => {
    const scope = new AsyncScope();
    const K1 = Key.of<string>('k1');
    const K2 = Key.of<string>('k2');
    await scope.run(async (root) => {
      root.set(K1, 'root');
      await scope.fork(async (mid) => {
        mid.set(K2, 'mid');
        await scope.fork((leaf) => {
          expect(leaf.get(K1)).toBe('root');
          expect(leaf.get(K2)).toBe('mid');
        });
      });
    });
  });
});

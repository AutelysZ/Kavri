import { describe, expect, it } from 'vitest';
import { Key } from './Key.js';
import { AsyncScope } from './AsyncScope.js';
import { Context } from './Context.js';

describe('AsyncScope', () => {
  it('isActive reflects scope state', async () => {
    const scope = new AsyncScope(Context);
    expect(scope.isActive()).toBe(false);
    await scope.run((ctx) => {
      expect(scope.isActive()).toBe(true);
      expect(ctx.isActive()).toBe(true);
    });
    expect(scope.isActive()).toBe(false);
  });

  it('run provides context to fn', async () => {
    const scope = new AsyncScope(Context);
    const K = Key.of<string>('k');
    await scope.run((ctx) => {
      ctx.set(K, 'hello');
      expect(ctx.get(K)).toBe('hello');
    });
  });

  it('run reuses active scope', async () => {
    const scope = new AsyncScope(Context);
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
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'pre-set');
    await scope.run((active) => {
      expect(active).toBe(ctx);
      expect(active.get(K)).toBe('pre-set');
    }, ctx);
  });

  it('run with mismatched state throws', async () => {
    const scope = new AsyncScope(Context);
    const other = new Context(scope);
    await scope.run(async () => {
      await expect(scope.run(() => {}, other)).rejects.toThrow('does not match active scope');
    });
  });

  it('fork creates child context', async () => {
    const scope = new AsyncScope(Context);
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
    const scope = new AsyncScope(Context);
    const other = new Context(scope);
    await scope.run(async () => {
      await expect(scope.fork(() => {}, other)).rejects.toThrow('does not match active scope');
    });
  });

  it('fork outside scope creates root + child', async () => {
    const scope = new AsyncScope(Context);
    const K = Key.of<string>('k');
    await scope.fork((ctx) => {
      ctx.set(K, 'value');
      expect(ctx.get(K)).toBe('value');
    });
  });

  it('enter creates scope imperatively', () => {
    const scope = new AsyncScope(Context);
    expect(scope.isActive()).toBe(false);
    scope.enter();
    expect(scope.isActive()).toBe(true);
    const K = Key.of<number>('k');
    scope.set(K, 42);
    expect(scope.get(K)).toBe(42);
  });

  it('enter with state', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'pre');
    scope.enter(ctx);
    expect(scope.get(K)).toBe('pre');
  });

  it('enter is no-op when already active', async () => {
    const scope = new AsyncScope(Context);
    await scope.run((ctx) => {
      scope.enter(); // no-op
      const K = Key.of<number>('k');
      ctx.set(K, 1);
      expect(scope.get(K)).toBe(1);
    });
  });

  it('enter with mismatched state throws', async () => {
    const scope = new AsyncScope(Context);
    const other = new Context(scope);
    await scope.run(() => {
      expect(() => scope.enter(other)).toThrow('does not match active scope');
    });
  });

  it('delegated state methods throw when not active', () => {
    const scope = new AsyncScope(Context);
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
    const scope = new AsyncScope(Context);
    const A = Key.of<number>('a');
    const B = Key.of<number>('b');
    await scope.run(() => {
      scope.set(A, 1).set(B, 2);
      expect(scope.get(A)).toBe(1);
      expect(scope.get(B)).toBe(2);
    });
  });

  it('create returns detached context', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'detached');
    expect(ctx.get(K)).toBe('detached');
    expect(scope.isActive()).toBe(false); // not in ALS
  });

  it('run returns value from fn', async () => {
    const scope = new AsyncScope(Context);
    expect(await scope.run(() => 42)).toBe(42);
  });

  it('fork returns value from fn', async () => {
    const scope = new AsyncScope(Context);
    const result = await scope.run(async () => scope.fork(() => 'forked'));
    expect(result).toBe('forked');
  });

  it('Context.run delegates to owning scope', async () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'pre');
    await ctx.run((active) => {
      expect(active).toBe(ctx);
      expect(scope.isActive()).toBe(true);
      expect(active.get(K)).toBe('pre');
    });
  });

  it('Context.fork delegates to owning scope', async () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'parent');
    await ctx.fork((child) => {
      expect(child).not.toBe(ctx);
      expect(child.get(K)).toBe('parent');
    });
  });

  it('Context.enter delegates to owning scope', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    ctx.enter();
    expect(scope.isActive()).toBe(true);
  });

  it('lazy ALS initialization', () => {
    const scope = new AsyncScope(Context);
    expect(scope.isActive()).toBe(false);
    // No ALS created until first scope entry
    const ctx = new Context(scope);
    expect(ctx.has(Key.of('x'))).toBe(false);
  });

  it('nested forks create chain', async () => {
    const scope = new AsyncScope(Context);
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

import { describe, it, expect } from 'vitest';
import { Key, AsyncContextStore } from './async-context.js';

describe('Key', () => {
  it('has a unique symbol', () => {
    const k1 = new Key<string>('a');
    const k2 = new Key<string>('a');
    expect(k1.symbol).not.toBe(k2.symbol);
    expect(k1.symbol.description).toBe('a');
  });

  it('symbol description is undefined when unnamed', () => {
    const k = new Key<string>();
    expect(k.symbol.description).toBeUndefined();
  });
});

describe('AsyncContextStore', () => {
  const ctx = new AsyncContextStore();

  it('isActive reflects scope state', async () => {
    expect(ctx.isActive()).toBe(false);
    await ctx.run(() => {
      expect(ctx.isActive()).toBe(true);
    });
    expect(ctx.isActive()).toBe(false);
  });

  it('get/set/has within scope', async () => {
    const k = ctx.key<string>('test');
    await ctx.run(() => {
      expect(ctx.has(k)).toBe(false);
      expect(ctx.get(k)).toBeUndefined();
      ctx.set(k, 'hello');
      expect(ctx.has(k)).toBe(true);
      expect(ctx.get(k)).toBe('hello');
    });
  });

  it('set(key, undefined) is distinguishable from absence', async () => {
    const k = ctx.key<string | undefined>('undef');
    await ctx.run(() => {
      expect(ctx.has(k)).toBe(false);
      ctx.set(k, undefined);
      expect(ctx.has(k)).toBe(true);
      expect(ctx.get(k)).toBeUndefined();
    });
  });

  it('getOrThrow returns value when set', async () => {
    const k = ctx.key<number>('v');
    await ctx.run(() => {
      ctx.set(k, 42);
      expect(ctx.getOrThrow(k)).toBe(42);
    });
  });

  it('getOrThrow throws when not in scope', () => {
    const k = ctx.key<string>('x');
    expect(() => ctx.getOrThrow(k)).toThrow('"x" is not set');
  });

  it('getOrThrow throws for unnamed key', () => {
    const k = ctx.key<string>();
    expect(() => ctx.getOrThrow(k)).toThrow('"(unnamed)" is not set');
  });

  it('getOrInsertComputed inserts on miss', async () => {
    const k = ctx.key<number>('lazy');
    await ctx.run(() => {
      expect(ctx.getOrInsertComputed(k, () => 42)).toBe(42);
      expect(ctx.get(k)).toBe(42);
      // Second call returns cached
      expect(ctx.getOrInsertComputed(k, () => 99)).toBe(42);
    });
  });

  it('delete removes own property only', async () => {
    const k = ctx.key<string>('del');
    await ctx.run(() => {
      ctx.set(k, 'value');
      expect(ctx.has(k)).toBe(true);
      ctx.delete(k);
      // Root scope has no parent, so key is gone
      expect(ctx.has(k)).toBe(false);
    });
  });

  it('throws on set outside scope', () => {
    const freshCtx = new AsyncContextStore();
    const k = freshCtx.key<string>('no-scope');
    expect(() => freshCtx.set(k, 'x')).toThrow('Not in AsyncContext scope');
  });

  it('throws on delete outside scope', () => {
    const freshCtx = new AsyncContextStore();
    const k = freshCtx.key<string>('no-scope');
    expect(() => freshCtx.delete(k)).toThrow('Not in AsyncContext scope');
  });

  it('get returns undefined outside scope', () => {
    const freshCtx = new AsyncContextStore();
    const k = freshCtx.key<string>('outside');
    expect(freshCtx.get(k)).toBeUndefined();
  });

  it('has returns false outside scope', () => {
    const freshCtx = new AsyncContextStore();
    const k = freshCtx.key<string>('outside');
    expect(freshCtx.has(k)).toBe(false);
  });

  it('run reuses existing scope', async () => {
    const k = ctx.key<string>('reuse');
    await ctx.run(async () => {
      ctx.set(k, 'outer');
      await ctx.run(() => {
        expect(ctx.get(k)).toBe('outer');
        ctx.set(k, 'inner');
      });
      expect(ctx.get(k)).toBe('inner');
    });
  });

  it('fork creates isolated child scope', async () => {
    const k = ctx.key<string>('fork');
    await ctx.run(async () => {
      ctx.set(k, 'parent');
      await ctx.fork(() => {
        expect(ctx.get(k)).toBe('parent');
        ctx.set(k, 'child');
        expect(ctx.get(k)).toBe('child');
      });
      expect(ctx.get(k)).toBe('parent');
    });
  });

  it('fork delete only removes own property — parent visible', async () => {
    const k = ctx.key<string>('fork-del');
    await ctx.run(async () => {
      ctx.set(k, 'parent');
      await ctx.fork(() => {
        // Inherited from parent
        expect(ctx.has(k)).toBe(true);
        expect(ctx.get(k)).toBe('parent');
        // Delete own property — parent still visible via prototype
        ctx.delete(k);
        expect(ctx.has(k)).toBe(true);
        expect(ctx.get(k)).toBe('parent');
      });
      expect(ctx.get(k)).toBe('parent');
    });
  });

  it('fork set then delete restores parent visibility', async () => {
    const k = ctx.key<string>('fork-set-del');
    await ctx.run(async () => {
      ctx.set(k, 'parent');
      await ctx.fork(() => {
        ctx.set(k, 'child');
        expect(ctx.get(k)).toBe('child');
        ctx.delete(k);
        // Own property removed, parent visible again
        expect(ctx.get(k)).toBe('parent');
      });
    });
  });

  it('enter is no-op when already in scope', async () => {
    await ctx.run(() => {
      const k = ctx.key<number>('enter');
      ctx.enter();
      ctx.set(k, 1);
      expect(ctx.get(k)).toBe(1);
    });
  });

  it('enter creates scope when not active', () => {
    const freshCtx = new AsyncContextStore();
    expect(freshCtx.isActive()).toBe(false);
    freshCtx.enter();
    expect(freshCtx.isActive()).toBe(true);
    const k = freshCtx.key<number>('entered');
    freshCtx.set(k, 99);
    expect(freshCtx.get(k)).toBe(99);
  });

  it('run returns the value from fn', async () => {
    expect(await ctx.run(() => 42)).toBe(42);
  });

  it('run handles async fn', async () => {
    expect(await ctx.run(async () => 'async')).toBe('async');
  });

  it('fork returns the value from fn', async () => {
    const result = await ctx.run(async () => ctx.fork(() => 'forked'));
    expect(result).toBe('forked');
  });

  it('fork outside scope creates child of empty root', async () => {
    const freshCtx = new AsyncContextStore();
    const k = freshCtx.key<string>('fork-root');
    const result = await freshCtx.fork(() => {
      freshCtx.set(k, 'value');
      return freshCtx.get(k);
    });
    expect(result).toBe('value');
  });

  it('nested forks create prototype chain', async () => {
    const k1 = ctx.key<string>('k1');
    const k2 = ctx.key<string>('k2');
    await ctx.run(async () => {
      ctx.set(k1, 'root');
      await ctx.fork(async () => {
        ctx.set(k2, 'mid');
        await ctx.fork(() => {
          expect(ctx.get(k1)).toBe('root');
          expect(ctx.get(k2)).toBe('mid');
        });
      });
    });
  });

  it('distinct keys with same name are independent', async () => {
    const k1 = ctx.key<string>('same');
    const k2 = ctx.key<string>('same');
    await ctx.run(() => {
      ctx.set(k1, 'a');
      ctx.set(k2, 'b');
      expect(ctx.get(k1)).toBe('a');
      expect(ctx.get(k2)).toBe('b');
    });
  });

  it('lazy ALS initialization', () => {
    const freshCtx = new AsyncContextStore();
    // isActive/has/get should work without throwing before any scope is created
    expect(freshCtx.isActive()).toBe(false);
    const k = freshCtx.key<string>('lazy');
    expect(freshCtx.has(k)).toBe(false);
    expect(freshCtx.get(k)).toBeUndefined();
  });
});

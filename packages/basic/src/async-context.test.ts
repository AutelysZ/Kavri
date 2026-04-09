import { describe, it, expect } from 'vitest';
import { Key, AsyncContext } from './async-context.js';

describe('Key', () => {
  it('get/set/has within scope', async () => {
    const k = AsyncContext.key<string>('test');
    await AsyncContext.run(() => {
      expect(k.has()).toBe(false);
      expect(k.get()).toBeUndefined();
      k.set('hello');
      expect(k.has()).toBe(true);
      expect(k.get()).toBe('hello');
    });
  });

  it('getOrThrow throws outside scope', () => {
    const k = new Key<string>('x');
    expect(() => k.getOrThrow()).toThrow('not set');
  });

  it('getOrInsertComputed inserts on miss', async () => {
    const k = AsyncContext.key<number>('lazy');
    await AsyncContext.run(() => {
      const v = k.getOrInsertComputed(() => 42);
      expect(v).toBe(42);
      expect(k.get()).toBe(42);
      // Second call returns cached
      const v2 = k.getOrInsertComputed(() => 99);
      expect(v2).toBe(42);
    });
  });

  it('delete blocks value', async () => {
    const k = AsyncContext.key<string>('del');
    await AsyncContext.run(() => {
      k.set('value');
      expect(k.has()).toBe(true);
      k.delete();
      expect(k.has()).toBe(false);
      expect(k.get()).toBeUndefined();
    });
  });

  it('throws on set/delete outside scope', () => {
    const k = new Key<string>('no-scope');
    expect(() => k.set('x')).toThrow('Not in AsyncContext scope');
    expect(() => k.delete()).toThrow('Not in AsyncContext scope');
  });
});

describe('AsyncContext', () => {
  it('isActive reflects scope state', async () => {
    expect(AsyncContext.isActive()).toBe(false);
    await AsyncContext.run(() => {
      expect(AsyncContext.isActive()).toBe(true);
    });
    expect(AsyncContext.isActive()).toBe(false);
  });

  it('run reuses existing scope', async () => {
    const k = AsyncContext.key<string>('reuse');
    await AsyncContext.run(async () => {
      k.set('outer');
      await AsyncContext.run(() => {
        // Same scope — sees outer value
        expect(k.get()).toBe('outer');
        k.set('inner');
      });
      // Mutation visible — same scope
      expect(k.get()).toBe('inner');
    });
  });

  it('fork creates isolated child scope', async () => {
    const k = AsyncContext.key<string>('fork');
    await AsyncContext.run(async () => {
      k.set('parent');
      await AsyncContext.fork(() => {
        // Inherits from parent via prototype chain
        expect(k.get()).toBe('parent');
        k.set('child');
        expect(k.get()).toBe('child');
      });
      // Parent unaffected
      expect(k.get()).toBe('parent');
    });
  });

  it('fork delete blocks parent value', async () => {
    const k = AsyncContext.key<string>('fork-del');
    await AsyncContext.run(async () => {
      k.set('parent');
      await AsyncContext.fork(() => {
        expect(k.get()).toBe('parent');
        k.delete();
        expect(k.has()).toBe(false);
        expect(k.get()).toBeUndefined();
      });
      // Parent still has value
      expect(k.get()).toBe('parent');
    });
  });

  it('enter creates scope imperatively', async () => {
    // enter() uses enterWith which persists for the current async context
    // Test via run to get a clean context
    await AsyncContext.run(() => {
      // Already in scope — enter() is a no-op
      const k = AsyncContext.key<number>('enter');
      AsyncContext.enter();
      k.set(1);
      expect(k.get()).toBe(1);
    });
  });

  it('run returns the value from fn', async () => {
    const result = await AsyncContext.run(() => 42);
    expect(result).toBe(42);
  });

  it('run handles async fn', async () => {
    const result = await AsyncContext.run(async () => {
      return 'async-result';
    });
    expect(result).toBe('async-result');
  });

  it('fork returns the value from fn', async () => {
    const result = await AsyncContext.run(async () => {
      return AsyncContext.fork(() => 'forked');
    });
    expect(result).toBe('forked');
  });

  it('nested forks create prototype chain', async () => {
    const k1 = AsyncContext.key<string>('k1');
    const k2 = AsyncContext.key<string>('k2');

    await AsyncContext.run(async () => {
      k1.set('root');
      await AsyncContext.fork(async () => {
        k2.set('mid');
        await AsyncContext.fork(() => {
          // Sees both parent and grandparent
          expect(k1.get()).toBe('root');
          expect(k2.get()).toBe('mid');
        });
      });
    });
  });
});

import { describe, expect, it } from 'vitest';
import { Key } from './Key.js';
import { AsyncScope } from './AsyncScope.js';
import { Context } from './Context.js';

describe('Context', () => {
  it('has/get/set', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    expect(ctx.has(K)).toBe(false);
    expect(ctx.get(K)).toBeUndefined();
    ctx.set(K, 'hello');
    expect(ctx.has(K)).toBe(true);
    expect(ctx.get(K)).toBe('hello');
  });

  it('set returns this for chaining', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const A = Key.of<number>('a');
    const B = Key.of<number>('b');
    ctx.set(A, 1).set(B, 2);
    expect(ctx.get(A)).toBe(1);
    expect(ctx.get(B)).toBe(2);
  });

  it('set(key, undefined) is distinguishable from absence', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string | undefined>('k');
    expect(ctx.has(K)).toBe(false);
    ctx.set(K, undefined);
    expect(ctx.has(K)).toBe(true);
    expect(ctx.get(K)).toBeUndefined();
  });

  it('delete removes own entry, returns boolean', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('k');
    ctx.set(K, 'val');
    expect(ctx.delete(K)).toBe(true);
    expect(ctx.has(K)).toBe(false);
    expect(ctx.delete(K)).toBe(false);
  });

  it('getOrThrow throws when absent', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('missing');
    expect(() => ctx.getOrThrow(K)).toThrow('"missing" is not set');
  });

  it('getOrThrow throws with (unnamed) for unnamed key', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>();
    expect(() => ctx.getOrThrow(K)).toThrow('"(unnamed)" is not set');
  });

  it('getOrThrow returns value when present', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<number>('v');
    ctx.set(K, 42);
    expect(ctx.getOrThrow(K)).toBe(42);
  });

  it('getOrInsert inserts on miss', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<number>('k');
    expect(ctx.getOrInsert(K, 42)).toBe(42);
    expect(ctx.get(K)).toBe(42);
    expect(ctx.getOrInsert(K, 99)).toBe(42); // cached
  });

  it('getOrInsertComputed inserts on miss', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<number>('k');
    expect(ctx.getOrInsertComputed(K, () => 42)).toBe(42);
    expect(ctx.get(K)).toBe(42);
    expect(ctx.getOrInsertComputed(K, () => 99)).toBe(42); // cached
  });

  it('getOrInsertComputed passes key to callback', () => {
    const scope = new AsyncScope(Context);
    const ctx = new Context(scope);
    const K = Key.of<string>('mykey');
    ctx.getOrInsertComputed(K, (k) => `computed:${k.name}`);
    expect(ctx.get(K)).toBe('computed:mykey');
  });
});

describe('Context.extend()', () => {
  it('child inherits parent values', () => {
    const scope = new AsyncScope(Context);
    const parent = new Context(scope);
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = new Context(scope, parent);
    expect(child.has(K)).toBe(true);
    expect(child.get(K)).toBe('parent');
  });

  it('child set does not affect parent', () => {
    const scope = new AsyncScope(Context);
    const parent = new Context(scope);
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = new Context(scope, parent);
    child.set(K, 'child');
    expect(child.get(K)).toBe('child');
    expect(parent.get(K)).toBe('parent');
  });

  it('child delete restores parent visibility', () => {
    const scope = new AsyncScope(Context);
    const parent = new Context(scope);
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = new Context(scope, parent);
    child.set(K, 'child');
    child.delete(K);
    expect(child.get(K)).toBe('parent');
  });

  it('delete on child without own entry does not affect parent', () => {
    const scope = new AsyncScope(Context);
    const parent = new Context(scope);
    const K = Key.of<string>('k');
    parent.set(K, 'parent');
    const child = new Context(scope, parent);
    child.delete(K); // no own entry
    expect(child.has(K)).toBe(true);
    expect(child.get(K)).toBe('parent');
  });

  it('getOrInsert uses parent value', () => {
    const scope = new AsyncScope(Context);
    const parent = new Context(scope);
    const K = Key.of<number>('k');
    parent.set(K, 1);
    const child = new Context(scope, parent);
    expect(child.getOrInsert(K, 99)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { Key } from './Key.js';

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

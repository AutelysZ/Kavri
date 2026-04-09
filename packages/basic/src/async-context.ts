import { AsyncLocalStorage } from 'node:async_hooks';
import type { Awaitable } from './types.js';

type State = Record<symbol, unknown>;
const DELETED: unique symbol = Symbol('DELETED');
const als = new AsyncLocalStorage<State>();

export class Key<T> {
  readonly name?: string;
  private readonly sym: symbol;

  constructor(name?: string) {
    this.name = name;
    this.sym = Symbol(name);
  }

  has(): boolean {
    const state = als.getStore();
    if (!state) return false;
    const val = state[this.sym];
    return val !== undefined && val !== DELETED;
  }

  get(): T | undefined {
    const state = als.getStore();
    if (!state) return undefined;
    const val = state[this.sym];
    return val === DELETED ? undefined : (val as T);
  }

  getOrThrow(): T {
    if (!this.has()) {
      throw new Error(`Key "${this.name ?? '(unnamed)'}" is not set`);
    }
    return this.get() as T;
  }

  getOrInsertComputed(fn: () => T): T {
    if (this.has()) return this.get() as T;
    const val = fn();
    this.set(val);
    return val;
  }

  set(value: T): void {
    const state = als.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    state[this.sym] = value;
  }

  delete(): void {
    const state = als.getStore();
    if (!state) throw new Error('Not in AsyncContext scope');
    state[this.sym] = DELETED;
  }
}

export const AsyncContext = {
  key<T>(name?: string): Key<T> {
    return new Key<T>(name);
  },

  isActive(): boolean {
    return als.getStore() !== undefined;
  },

  enter(): void {
    if (als.getStore()) return;
    als.enterWith(Object.create(null) as State);
  },

  async run<T>(fn: () => Awaitable<T>): Promise<T> {
    if (als.getStore()) return fn();
    return als.run(Object.create(null) as State, fn);
  },

  async fork<T>(fn: () => Awaitable<T>): Promise<T> {
    const current = als.getStore() ?? (Object.create(null) as State);
    return als.run(Object.create(current) as State, fn);
  },
};

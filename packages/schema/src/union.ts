import type { AnyConstructor } from '@kavri/basic';

// eslint-disable-next-line
export type Union<T extends Record<string, any>, H> = {
  as<K extends keyof T>(key: K): T[K];
  is<K extends keyof T>(key: K): boolean;
  toHandle(): H;
} & {
  [P in keyof T as `as${Capitalize<P & string>}`]: () => T[P];
};

// eslint-disable-next-line
export type UnionConstructor<T extends Record<string, any>, H> = {
  is<T>(this: AnyConstructor<T>, v: unknown): v is T;
  of<K extends keyof T>(key: K, value: T[K]): Union<T, H>;
  register<K extends keyof T>(key: K, handler: (value: T[K]) => H): void;
  new (): Union<T, H>;
} & {
  [P in keyof T as `of${Capitalize<P & string>}`]: (value: T[P]) => Union<T, H>;
};

// #__NO_SIDE_EFFECTS__
// eslint-disable-next-line
export function createUnionClass<T extends Record<string, any>, H>(
  name: string,
  init?: (ctor: UnionConstructor<T, H>) => void,
): UnionConstructor<T, H> {
  class Union {
    static #handlers = new Map<string, (value: unknown) => unknown>();
    static of(key: string, value: unknown) {
      return new Union(key, value);
    }

    static is(v: unknown) {
      return v instanceof this;
    }

    static register(key: string, handler: (value: unknown) => unknown) {
      if (this.#handlers.has(key)) {
        throw new Error(`${name}'s handler ${key} is already registered`);
      }
      this.#handlers.set(key, handler);
      Object.defineProperty(Union, `of${key}`, {
        value: function (this: UnionConstructor<Record<string, unknown>, unknown>, value: unknown) {
          return this.of(key, value);
        },
      });
      Object.defineProperty(Union.prototype, `as${key}`, {
        value: function (this: Union) {
          return this.as(key);
        },
      });
    }

    readonly #key: string;
    readonly #value: unknown;

    constructor(key: string, value: unknown) {
      this.#key = key;
      this.#value = value;
    }

    as(key: string) {
      if (this.#key === key) {
        return this.#value;
      }
      throw new TypeError(`${name} is ${this.#key}, not ${key}`);
    }

    is(key: string) {
      return this.#key === key;
    }

    toHandle() {
      // eslint-disable-next-line
      return Union.#handlers.get(this.#key)!(this);
    }
  }

  init?.(Union as never);

  return Union as never;
}

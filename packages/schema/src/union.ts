import type { AnyConstructor } from '@kavri/basic';

// eslint-disable-next-line
export type Union<T extends Record<string, any>, H> = {
  as<K extends keyof T>(type: K): T[K];
  is<K extends keyof T>(type: K): boolean;
  toHandle(): H;
  get type(): keyof T;
  get value(): T[keyof T];
} & {
  [P in keyof T as `as${Capitalize<P & string>}`]: () => T[P];
};

// eslint-disable-next-line
export type UnionConstructor<T extends Record<string, any>, H> = {
  is<T>(this: AnyConstructor<T>, v: unknown): v is T;
  of<K extends keyof T>(type: K, value: T[K]): Union<T, H>;
  register<K extends keyof T>(type: K, handler: (value: T[K]) => H): void;
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
    static of(type: string, value: unknown) {
      return new Union(type, value);
    }

    static is(v: unknown) {
      return v instanceof this;
    }

    static register(type: string, handler: (value: unknown) => unknown) {
      if (this.#handlers.has(type)) {
        throw new Error(`${name}'s handler ${type} is already registered`);
      }
      this.#handlers.set(type, handler);
      Object.defineProperty(Union, `of${type}`, {
        value: function (this: UnionConstructor<Record<string, unknown>, unknown>, value: unknown) {
          return this.of(type, value);
        },
      });
      Object.defineProperty(Union.prototype, `as${type}`, {
        value: function (this: Union) {
          return this.as(type);
        },
      });
    }

    readonly #type: string;
    readonly #value: unknown;

    constructor(type: string, value: unknown) {
      this.#type = type;
      this.#value = value;
    }

    as(type: string) {
      if (this.#type === type) {
        return this.#value;
      }
      throw new TypeError(`${name} is ${this.#type}, not ${type}`);
    }

    is(type: string) {
      return this.#type === type;
    }

    toHandle() {
      // eslint-disable-next-line
      return Union.#handlers.get(this.#type)!(this);
    }

    get type() {
      return this.#type;
    }

    get value() {
      return this.#value;
    }
  }

  init?.(Union as never);

  return Union as never;
}

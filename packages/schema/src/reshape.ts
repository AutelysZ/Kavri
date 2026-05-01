import type { AnyConstructor, UnionToIntersection } from '@kavri/basic';
import { todo } from './utils.js';

/**
 * Omit specified fields.
 *
 * Using `Omit` for type reshaping is generally not a good idea,
 * as it may inadvertently introduce unintended fields.
 * Whenever possible, try to use more restrictive methods—such as
 * {@link Pick} instead.
 *
 * @param ctor
 * @param keys
 * @constructor
 */
export function Omit<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K>> {
  todo();
}

export function Pick<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Pick<T, K>> {
  todo();
}

export function Partial<T>(ctor: AnyConstructor<T>): AnyConstructor<globalThis.Partial<T>>;
export function Partial<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K> & globalThis.Partial<globalThis.Pick<T, K>>>;
export function Partial<T>(
  ctor: AnyConstructor<T>,
  ...keys: (keyof T)[]
): AnyConstructor<globalThis.Partial<T>> {
  todo();
}

export function PickPartial<T, const P extends keyof T, const O extends keyof T>(
  ctor: AnyConstructor<T>,
  pick: readonly P[],
  partial: readonly O[],
): AnyConstructor<globalThis.Pick<T, P> & globalThis.Partial<globalThis.Pick<T, O>>> {
  todo();
}

export function Required<T>(ctor: AnyConstructor<T>): AnyConstructor<globalThis.Required<T>>;
export function Required<T, const K extends keyof T>(
  ctor: AnyConstructor<T>,
  ...keys: K[]
): AnyConstructor<globalThis.Omit<T, K> & globalThis.Required<globalThis.Pick<T, K>>>;
export function Required<T>(
  ctor: AnyConstructor<T>,
  ...keys: (keyof T)[]
): AnyConstructor<globalThis.Required<T>> {
  todo();
}

export function Merge<const E extends readonly AnyConstructor[] | []>(
  ctor: E,
): AnyConstructor<
  UnionToIntersection<
    {
      [P in keyof E]: E[P] extends AnyConstructor<infer U> ? U : never;
    }[number]
  >
> {
  todo();
}

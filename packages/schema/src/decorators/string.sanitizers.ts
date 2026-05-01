import blacklist from 'validator/es/lib/blacklist';
import escape from 'validator/es/lib/escape';
import ltrim from 'validator/es/lib/ltrim';
import normalizeEmail from 'validator/es/lib/normalizeEmail';
import rtrim from 'validator/es/lib/rtrim';
import stripLow from 'validator/es/lib/stripLow';
import trim from 'validator/es/lib/trim';
import unescape from 'validator/es/lib/unescape';
import whitelist from 'validator/es/lib/whitelist';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorFactory,
  type FieldSchemaDecoratorFactoryStatic,
  Phase,
} from '../field.js';
import { isString } from '../utils.js';
import { IsString, type StringOptions } from './string.js';

function ss(
  rule: string,
  noArg: boolean,
  sanitizer: (value: string, param: unknown) => string | boolean,
) {
  const factory = createFieldSchemaDecoratorFactory(
    rule,
    (...args: unknown[]): FieldSchemaDecorator<unknown> => {
      const [opts, info] = decoupleOptions(args[noArg ? 0 : 1] ?? {});
      return FieldSchema<unknown>(factory, noArg ? void 0 : args[0], opts, [IsString(info)]);
    },
    {
      phase: Phase.Normalization,
      message: '.label is invalid',
      decode: ({ params, value, provide }) => {
        if (!isString(value)) return true;
        const next = sanitizer(value, params);
        if (!isString(next)) return false;
        return provide(next);
      },
    },
  );
  return factory as FieldSchemaDecoratorFactory;
}

export type SS0 = ((schema?: StringOptions) => FieldSchemaDecorator<undefined>) &
  FieldSchemaDecoratorFactoryStatic<undefined>;

function ss0(rule: string, sanitizer: (value: string) => string | boolean): SS0 {
  return ss(rule, true, sanitizer as never);
}

export type SSO<P> = ((param?: P, schema?: StringOptions) => FieldSchemaDecorator<P | undefined>) &
  FieldSchemaDecoratorFactoryStatic<P | undefined>;

function sso<P>(rule: string, sanitizer: (value: string, param?: P) => string | boolean): SSO<P> {
  return ss(rule, false, sanitizer as never);
}

export type SSR<P> = ((param: P, schema?: StringOptions) => FieldSchemaDecorator<P>) &
  FieldSchemaDecoratorFactoryStatic<P>;

function ssr<P>(rule: string, sanitizer: (value: string, param: P) => string | boolean): SSR<P> {
  return ss(rule, false, sanitizer as never);
}

export const ToLowerCase = ss0('ToLowerCase', (v) => v.toLowerCase());
export const ToUpperCase = ss0('ToUpperCase', (v) => v.toUpperCase());
export const Escape = ss0('Escape', escape);
export const Unescape = ss0('Unescape', unescape);

export const Trim = sso('Trim', trim);
export const LTrim = sso('LTrim', ltrim);
export const RTrim = sso('RTrim', rtrim);
export const StripLow = sso('StripLow', stripLow);
export const NormalizeEmail = sso('NormalizeEmail', normalizeEmail);

export const Blacklist = ssr('Blacklist', blacklist);
export const Whitelist = ssr('Whitelist', whitelist);

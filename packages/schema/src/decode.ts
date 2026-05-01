import type { KeyMap } from '@kavri/basic';
import type { AnyConstructor } from '@kavri/basic';
import type { FieldSchemaDecoratorMetadata, NestedFieldSchema } from './field.js';

/** A single validation issue. */
export interface RuleIssue {
  rule: string;
  params: unknown;
  message: string;
}

export interface DecodeIssue {
  issues?: RuleIssue[];
  children?: FieldIssue[];
}

export interface FieldIssue extends DecodeIssue {
  field: string;
}

export class DecodeResult<T = unknown> {
  constructor(
    readonly ok: boolean,
    private readonly data: T | DecodeIssue,
  ) {}

  get value() {
    return this.data as T;
  }

  get issue() {
    return this.data as DecodeIssue;
  }
}

export class DecodeContext<P = unknown> {
  readonly field!: string | undefined;
  readonly errors!: (string | undefined /* as default */)[];
  readonly value!: unknown;
  readonly originalValue!: unknown;
  readonly object!: unknown;
  readonly parent!: DecodeContext | undefined;
  readonly params!: P;
  readonly evaluated!: Set<string>;
  readonly state!: KeyMap;
  readonly currentRule!: FieldSchemaDecoratorMetadata;
  readonly rules!: readonly FieldSchemaDecoratorMetadata[];

  readonly provide = (value: unknown) => new DecodeResult(true, value);

  readonly child = (field: string, value: unknown, schema: NestedFieldSchema): DecodeContext => {};
}

/**
 * Validate and parse the input according to the schema
 * @param clazz use class's schema to decode
 * @param input plain object input
 */
export function decode<T>(clazz: AnyConstructor<T>, input: unknown): DecodeResult<T>;

/**
 * Validate and parse the input according to the schema
 * @param schema use the specified schema to decode
 * @param input plain object input
 * @throws SchemaValidationError
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function decode<T>(schema: NestedFieldSchema, input: unknown): DecodeResult<T>;

/**
 * Evaluate with a context
 * @param ctx
 */
export function decode<T>(ctx: DecodeContext): DecodeResult<T>;
export function decode(
  clazz: AnyConstructor | NestedFieldSchema | DecodeContext,
  input?: unknown,
): DecodeResult<unknown> {
  throw new Error('Not implemented');
}

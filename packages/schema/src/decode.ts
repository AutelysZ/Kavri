import { type AnyConstructor, KeyMap, Metadata } from '@kavri/basic';
import {
  DecoratorPhaseStrategy,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  FieldSchemaDecoratorName,
  isFieldSchemaDecorator,
  type NestedFieldSchema,
  type Phase,
  Strategy,
} from './field.js';
import { isArray } from './utils.js';

/**
 * A single validation issue produced by one decorator rule.
 */
export interface RuleIssue {
  /**
   * The decorator's registered name (e.g. `'MinLength'`).
   */
  rule: string;
  /**
   * The decorator's params at the time of failure.
   */
  params: unknown;
  /**
   * Formatted error message with placeholders resolved.
   */
  message: string;
}

/**
 * Aggregate decode failure for a single value.
 */
export interface DecodeIssue {
  issues?: RuleIssue[];
  children?: FieldIssue[];
}

/**
 * A `DecodeIssue` tagged with the field it came from.
 */
export interface FieldIssue extends DecodeIssue {
  field: string;
}

/**
 * Container for a single decode outcome. `ok === true` → `value` carries the
 * (possibly coerced) data; `ok === false` → `issue` carries the report.
 */
export class DecodeResult<T = unknown> {
  constructor(
    readonly ok: boolean,
    private readonly data: T | DecodeIssue,
  ) {}

  get value(): T {
    return this.data as T;
  }

  get issue(): DecodeIssue {
    return this.data as DecodeIssue;
  }
}

/**
 * Constructor input for `DecodeContext`.
 */
export interface DecodeContextInit {
  field?: string;
  value: unknown;
  /**
   * Defaults to `value` when omitted (root contexts).
   */
  object?: unknown;
  parent?: DecodeContext;
  rules: readonly FieldSchemaDecoratorMetadata[];
  /**
   * Shared between parent and children when omitted (defaults to a fresh `KeyMap`).
   */
  state?: KeyMap;
}

/**
 * Per-value decode state. Created once per field (or per nested call to
 * `ctx.child`); the runner mutates `value` (via `provide`), `params`, and
 * `currentRule` as it walks the rule list.
 */
export class DecodeContext<P = unknown> {
  /**
   * The field name within the parent object, if any (root contexts: `undefined`).
   */
  readonly field: string | undefined;
  /**
   * Live value. Mutated by `provide()` so subsequent rules see the coerced form.
   */
  value: unknown;
  /**
   * Snapshot of `value` at construction time.
   */
  readonly originalValue: unknown;
  /**
   * The owning instance/object when this context is a field of one.
   */
  readonly object: unknown;
  readonly parent: DecodeContext | undefined;
  /**
   * Shared per-context key/value bag for rule-to-rule signalling.
   */
  readonly state: KeyMap;
  /**
   * All rule metadata at this level (siblings + the current rule).
   */
  readonly rules: readonly FieldSchemaDecoratorMetadata[];
  /**
   * Annotation set used by `unevaluatedProperties`/`unevaluatedItems` and
   * other rules that need to know what siblings consumed.
   */
  readonly evaluated: Set<string>;
  /**
   * The currently-executing rule's params (set per-rule by the runner).
   */
  params!: P;
  /**
   * The currently-executing rule's metadata (set per-rule by the runner).
   */
  currentRule!: FieldSchemaDecoratorMetadata;

  constructor(init: DecodeContextInit) {
    this.field = init.field;
    this.value = init.value;
    this.originalValue = init.value;
    this.object = init.object ?? init.value;
    this.parent = init.parent;
    this.rules = init.rules;
    this.state = init.state ?? new KeyMap();
    this.evaluated = new Set();
  }

  /**
   * Replace `ctx.value` for the rest of the pipeline and return a successful
   * `DecodeResult` carrying the new value.
   */
  readonly provide = (value: unknown): DecodeResult => {
    this.value = value;
    return new DecodeResult(true, value);
  };

  /**
   * Build a child context for a nested value (object property, array item,
   * etc.). State is shared; `evaluated` is fresh per child.
   */
  readonly child = (field: string, value: unknown, schema: NestedFieldSchema): DecodeContext => {
    return new DecodeContext({
      field,
      value,
      object: this.object,
      parent: this,
      rules: normalizeSchema(schema),
      state: this.state,
    });
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode an instance against a `@Schema` class's field decorators.
 */
export function decode<T>(clazz: AnyConstructor<T>, input: unknown): DecodeResult<T>;

/**
 * Decode a value against an explicit `NestedFieldSchema`.
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function decode<T>(schema: NestedFieldSchema, input: unknown): DecodeResult<T>;

/**
 * Re-enter the pipeline with an already-built `DecodeContext`.
 */
export function decode<T>(ctx: DecodeContext): DecodeResult<T>;

export function decode(
  input: AnyConstructor | NestedFieldSchema | DecodeContext,
  value?: unknown,
): DecodeResult<unknown> {
  if (input instanceof DecodeContext) {
    return runContext(input);
  }
  if (typeof input === 'function' && !isFieldSchemaDecorator(input)) {
    return decodeClass(input as AnyConstructor, value);
  }
  return decodeSchema(input as NestedFieldSchema, value);
}

// ---------------------------------------------------------------------------
// Class / schema entry points
// ---------------------------------------------------------------------------

function decodeSchema(schema: NestedFieldSchema, value: unknown): DecodeResult<unknown> {
  return runContext(new DecodeContext({ value, rules: normalizeSchema(schema) }));
}

function decodeClass(clazz: AnyConstructor, input: unknown): DecodeResult<unknown> {
  const fields = Metadata.lookupField(FieldSchema, clazz);
  if (!fields || fields.size === 0) {
    return new DecodeResult(true, input);
  }
  const out: Record<string, unknown> = {};
  const children: FieldIssue[] = [];
  for (const [key, entries] of fields) {
    const k = String(key);
    const fieldValue = (input as Record<string, unknown> | null | undefined)?.[k];
    const ctx = new DecodeContext({
      field: k,
      value: fieldValue,
      object: input,
      rules: entries as readonly FieldSchemaDecoratorMetadata[],
    });
    const result = runContext(ctx);
    if (result.ok) {
      out[k] = result.value;
      continue;
    }
    const issue = result.issue;
    children.push(
      'field' in issue && (issue as FieldIssue).field !== undefined
        ? (issue as FieldIssue)
        : { field: k, ...issue },
    );
  }
  if (children.length === 0) {
    // Reify the class so the result has the right prototype chain.
    return new DecodeResult(true, Object.assign(Object.create(clazz.prototype), out));
  }
  return new DecodeResult(false, { children });
}

// ---------------------------------------------------------------------------
// Runner — phase × strategy state machine
// ---------------------------------------------------------------------------

interface RuleOutcome {
  ok: boolean;
  /**
   * Rule returned a string error message instead of plain `false`.
   */
  message?: string;
  /**
   * Sub-results from nested `decode()` calls.
   */
  subResults?: readonly DecodeResult[];
}

function runContext(ctx: DecodeContext): DecodeResult {
  const groups = groupByPhase(ctx.rules);
  const issues: RuleIssue[] = [];
  const childIssues: FieldIssue[] = [];

  for (const [phase, rules] of groups) {
    // Strategy is fixed per phase via `DecoratorPhaseStrategy` — there's no
    // per-rule override slot anymore.
    const strategy = DecoratorPhaseStrategy[phase];

    let phaseHadAnyPass = false;
    let phasePassedAny = false;
    let lastAnyPassError: RuleIssue | undefined;

    for (const rule of rules) {
      ctx.currentRule = rule;
      ctx.params = rule.params as never;
      const outcome = invokeRule(rule, ctx);

      // Fold any sub-results (from `Properties.decode → decode(ctx.child(...))`,
      // `Ref.decode → decode(class, value)`, etc.) into the aggregate report.
      if (outcome.subResults) {
        for (const sub of outcome.subResults) {
          if (sub.ok) continue;
          absorbIssue(sub.issue, issues, childIssues);
        }
      }

      switch (strategy) {
        case Strategy.ShortCircuit:
          // Pass → stop the entire pipeline successfully.
          // Fail → this rule didn't apply; continue silently (no recorded error).
          if (outcome.ok) return finalize(ctx, issues, childIssues, true);
          break;

        case Strategy.AnyPass:
          phaseHadAnyPass = true;
          if (outcome.ok) {
            phasePassedAny = true;
          } else {
            lastAnyPassError ??= makeIssue(rule, ctx, outcome.message);
          }
          break;

        case Strategy.FailFast:
          if (!outcome.ok) {
            issues.push(makeIssue(rule, ctx, outcome.message));
            return finalize(ctx, issues, childIssues, false);
          }
          break;

        case Strategy.ContinueOnError:
        default:
          if (!outcome.ok) {
            issues.push(makeIssue(rule, ctx, outcome.message));
          }
          break;
      }

      // AnyPass within a phase: skip remaining rules once anyone has passed.
      if (phasePassedAny) break;
    }

    // AnyPass evaluated and nobody passed → phase failure.
    if (phaseHadAnyPass && !phasePassedAny) {
      if (lastAnyPassError) issues.push(lastAnyPassError);
      return finalize(ctx, issues, childIssues, false);
    }
  }

  return finalize(ctx, issues, childIssues, issues.length === 0 && childIssues.length === 0);
}

function invokeRule(rule: FieldSchemaDecoratorMetadata, ctx: DecodeContext): RuleOutcome {
  if (!rule.factory.decode) return { ok: true };
  let result: ReturnType<NonNullable<typeof rule.factory.decode>>;
  try {
    result = rule.factory.decode(ctx);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  if (result === true || result === undefined) return { ok: true };
  if (result === false) return { ok: false };
  if (typeof result === 'string') return { ok: false, message: result };
  if (result instanceof DecodeResult) {
    return result.ok ? { ok: true } : { ok: false, subResults: [result] };
  }
  if (isArray(result)) {
    const arr = result as readonly DecodeResult[];
    return { ok: arr.every((r) => r.ok), subResults: arr };
  }
  return { ok: true };
}

function absorbIssue(issue: DecodeIssue, issues: RuleIssue[], childIssues: FieldIssue[]): void {
  if ('field' in issue && (issue as FieldIssue).field !== undefined) {
    childIssues.push(issue as FieldIssue);
    return;
  }
  if (issue.issues) issues.push(...issue.issues);
  if (issue.children) childIssues.push(...issue.children);
}

function finalize(
  ctx: DecodeContext,
  issues: RuleIssue[],
  childIssues: FieldIssue[],
  ok: boolean,
): DecodeResult {
  if (ok) return new DecodeResult(true, ctx.value);
  const issue: DecodeIssue = {};
  if (issues.length) issue.issues = issues;
  if (childIssues.length) issue.children = childIssues;
  if (ctx.field !== undefined) {
    return new DecodeResult(false, { field: ctx.field, ...issue } as FieldIssue);
  }
  return new DecodeResult(false, issue);
}

function groupByPhase(
  rules: readonly FieldSchemaDecoratorMetadata[],
): Array<[Phase, FieldSchemaDecoratorMetadata[]]> {
  const map = new Map<Phase, FieldSchemaDecoratorMetadata[]>();
  for (const rule of rules) {
    let bucket = map.get(rule.factory.phase);
    if (!bucket) {
      bucket = [];
      map.set(rule.factory.phase, bucket);
    }
    bucket.push(rule);
  }
  // Phases run in numeric (enum) order.
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------------------
// Issue formatting
// ---------------------------------------------------------------------------

function makeIssue(
  rule: FieldSchemaDecoratorMetadata,
  ctx: DecodeContext,
  override?: string,
): RuleIssue {
  const tpl =
    override !== undefined
      ? override
      : typeof rule.factory.message === 'function'
        ? rule.factory.message(ctx)
        : rule.factory.message;
  return {
    rule: rule.factory[FieldSchemaDecoratorName],
    params: rule.params,
    message: formatTemplate(tpl, rule, ctx),
  };
}

/**
 * Resolve placeholders in a message template. The supported roots map to:
 *
 * - `.label`  → `options.label ?? options.title ?? ctx.field`
 * - `.key`    → `ctx.field`
 * - `.value`  → `ctx.value` (the data being validated)
 * - `.params` → `rule.params`
 * - `.input`  → `ctx.object`
 *
 * Each root supports nested property access via dotted paths
 * (`.params.format`, `.input.otherField`, `.value.length`). Unknown roots
 * are left untouched in the template.
 */
function formatTemplate(
  tpl: string,
  rule: FieldSchemaDecoratorMetadata,
  ctx: DecodeContext,
): string {
  if (!tpl) return '';
  const opts = rule.options as { label?: string; title?: string } | undefined;
  const label = opts?.label ?? opts?.title ?? ctx.field ?? '';
  return tpl.replace(/\.([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g, (match, path: string) => {
    const segments = path.split('.');
    const root = segments[0];
    let current: unknown;
    switch (root) {
      case 'label':
        current = label;
        break;
      case 'key':
        current = ctx.field;
        break;
      case 'value':
        current = ctx.value;
        break;
      case 'params':
        current = rule.params;
        break;
      case 'input':
        current = ctx.object;
        break;
      default:
        return match; // Not a known placeholder; leave the original text.
    }
    for (let i = 1; i < segments.length; i++) {
      if (current == null) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segments[i]];
    }
    return formatScalar(current);
  });
}

function formatScalar(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// Schema → metadata normalization
// ---------------------------------------------------------------------------

function normalizeSchema(schema: NestedFieldSchema): FieldSchemaDecoratorMetadata[] {
  if (isArray(schema)) {
    return schema.map(toMetadata);
  }
  return [toMetadata(schema)];
}

function toMetadata(
  s: FieldSchemaDecorator | FieldSchemaDecoratorMetadata,
): FieldSchemaDecoratorMetadata {
  return isFieldSchemaDecorator(s) ? s.metadata : s;
}

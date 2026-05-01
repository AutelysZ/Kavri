import { type BaseOptions, IsInstanceOf, IsNumber, IsString } from '@kavri/schema';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  ofValueField,
  Phase,
  type ValidateField,
  type ValidateOptions,
} from '../field.js';
import { isNumber, isString } from '../utils.js';
import { decoupleTypeOptions, Info } from './base.js';

/**
 * Inputs accepted by `resolveDate` — used as the *reference* date in
 * `IsBefore` / `IsAfter` and in `DateOptions.before` / `after`. This is
 * declarative: `number` is interpreted as a ms offset from "now", not a
 * timestamp. Use a `Date` instance for absolute moments.
 *
 * - `Date` — used as-is.
 * - `Duration` — applied to "now" via `Duration#addTo` (calendar-aware).
 * - `number` — milliseconds offset from "now" at decode time (positive =
 *   future, negative = past). E.g. `86_400_000` → "1 day from now".
 * - `string` — one of:
 *   - any string `new Date(value)` accepts (ISO 8601, RFC 2822, etc.),
 *   - the literal `'now'`,
 *   - relative `'now±<ISO 8601 duration>'` or `'±<ISO 8601 duration>'`
 *     (e.g. `'now+P1D'`, `'-PT30M'`, `'+PT12H'`),
 *   - a bare ISO 8601 duration `'P…'` — treated as a positive offset from
 *     "now" (e.g. `'P1D'` ≡ `'+P1D'`).
 *
 * Note that `IsDate.decode` accepts the same shapes for *instance* values
 * (the data being validated) but interprets bare `number` there as a
 * timestamp (ms since epoch), since values are concrete moments rather than
 * declarative offsets.
 */
export type DateInput = Date | Duration | number | string;

/**
 * Output format used by `IsDate.encode` and `IsDate.toJsonSchema`:
 * - `iso` — ISO 8601 date-time string (default)
 * - `date` — ISO 8601 date-only string (`YYYY-MM-DD`)
 * - `unix` — seconds since epoch (integer)
 * - `unix-ms` — milliseconds since epoch (integer)
 */
export type DateFormat = 'iso' | 'date' | 'unix' | 'unix-ms';

/** Options for `IsDate`. */
export interface DateOptions extends Omit<BaseOptions<Date>, 'default'> {
  /** Output format. Default: `'iso'`. */
  format?: DateFormat;
  /** Reserved for restricting accepted input formats. Currently advisory. */
  inputFormat?: DateFormat[];
  /** Value must be strictly before this date. `undefined` means "now". */
  before?: ValidateField<DateInput | undefined>;
  /** Value must be strictly after this date. `undefined` means "now". */
  after?: ValidateField<DateInput | undefined>;
  default?: ValidateField<DateInput>;
}

// ---------------------------------------------------------------------------
// Duration (ISO 8601)
// ---------------------------------------------------------------------------

/** Component fields of an ISO 8601 duration. */
export interface DurationParts {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  /** Negate the entire duration. */
  negative?: boolean;
}

/**
 * Whole-string match against an ISO 8601 duration.
 *
 * Grammar (`P[nY][nM][nW][nD][T[nH][nM][nS]]`):
 * - At least one component is required (the regex permits an all-empty match,
 *   `Duration.parse` rejects that case explicitly).
 * - `M` before `T` is months; after `T` is minutes.
 * - Numeric components allow a decimal fraction (`PT1.5H`).
 *
 * Whole-string sign (`-P1D` / `+P1D`) is stripped before this match runs.
 */
const ISO_DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * ISO 8601 duration (`PnYnMnWnDTnHnMnS`). Implemented manually because
 * `Temporal.Duration` is not yet available in Node.
 *
 * `addTo` follows the ISO 8601 / Temporal data model:
 * - **Calendar units** (years, months, weeks, days) preserve the wall-clock
 *   time, so DST transitions change the absolute duration in milliseconds
 *   (e.g. "+ 1 day" across a spring-forward boundary is 23 real hours, not
 *   24). Implemented via `Date#setFullYear` / `setMonth` / `setDate`.
 * - **Time units** (hours, minutes, seconds) are absolute and fixed-length —
 *   they do not "skip" a missing wall-clock hour on DST transitions. "+ 1
 *   hour" added to `01:30` on spring-forward day yields `03:30`. Implemented
 *   via `Date#setTime`.
 *
 * The "local time" interpretation used by `setFullYear` etc. is the host
 * process's system timezone — `Date` carries no zone of its own. For zone-
 * aware arithmetic, switch to `Temporal.ZonedDateTime` once available.
 *
 * Integer-only assumption: year/month/week/day fractions are truncated by
 * `setFullYear` / `setMonth` / `setDate`. Pass smaller units if you need
 * fractional precision (e.g. `PT36H` instead of `P1.5D`).
 */
export class Duration implements DurationParts {
  readonly years: number;
  readonly months: number;
  readonly weeks: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly negative: boolean;

  constructor({
    years = 0,
    months = 0,
    weeks = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    negative = false,
  }: DurationParts = {}) {
    this.years = years;
    this.months = months;
    this.weeks = weeks;
    this.days = days;
    this.hours = hours;
    this.minutes = minutes;
    this.seconds = seconds;
    this.negative = negative;
  }

  /**
   * Parse an ISO 8601 duration string. Accepts an optional whole-string
   * sign (`-P1D` / `+P1D`). Throws on invalid input.
   */
  static parse(str: string): Duration {
    let body = str.trim();
    let negative = false;
    if (body.startsWith('-')) {
      negative = true;
      body = body.substring(1);
    } else if (body.startsWith('+')) {
      body = body.substring(1);
    }
    const m = ISO_DURATION_RE.exec(body);
    if (!m) {
      throw new Error(`Invalid ISO 8601 duration: ${str}`);
    }
    const [, y, mo, w, d, h, mi, sec] = m;
    if (!y && !mo && !w && !d && !h && !mi && !sec) {
      throw new Error(`Invalid ISO 8601 duration: ${str}`);
    }
    return new Duration({
      years: y ? parseFloat(y) : 0,
      months: mo ? parseFloat(mo) : 0,
      weeks: w ? parseFloat(w) : 0,
      days: d ? parseFloat(d) : 0,
      hours: h ? parseFloat(h) : 0,
      minutes: mi ? parseFloat(mi) : 0,
      seconds: sec ? parseFloat(sec) : 0,
      negative,
    });
  }

  /** Return a new `Duration` with the sign flipped. */
  negate(): Duration {
    return new Duration({
      years: this.years,
      months: this.months,
      weeks: this.weeks,
      days: this.days,
      hours: this.hours,
      minutes: this.minutes,
      seconds: this.seconds,
      negative: !this.negative,
    });
  }

  /**
   * Apply this duration to a `Date`, returning a new `Date`. See the class
   * doc for the calendar/time-unit split and the DST semantics.
   */
  addTo(date: Date): Date {
    const sign = this.negative ? -1 : 1;
    const out = new Date(date.getTime());
    if (this.years) out.setFullYear(out.getFullYear() + sign * this.years);
    if (this.months) out.setMonth(out.getMonth() + sign * this.months);
    const calendarDays = this.weeks * 7 + this.days;
    if (calendarDays) out.setDate(out.getDate() + sign * calendarDays);
    const timeMs = this.hours * 3_600_000 + this.minutes * 60_000 + this.seconds * 1_000;
    if (timeMs) out.setTime(out.getTime() + sign * timeMs);
    return out;
  }

  /** Serialize back to canonical ISO 8601 form. */
  toString(): string {
    const date: string[] = [];
    if (this.years) date.push(`${this.years}Y`);
    if (this.months) date.push(`${this.months}M`);
    if (this.weeks) date.push(`${this.weeks}W`);
    if (this.days) date.push(`${this.days}D`);
    const time: string[] = [];
    if (this.hours) time.push(`${this.hours}H`);
    if (this.minutes) time.push(`${this.minutes}M`);
    if (this.seconds) time.push(`${this.seconds}S`);
    let s = `P${date.join('')}`;
    if (time.length) s += `T${time.join('')}`;
    if (date.length === 0 && time.length === 0) s = 'PT0S';
    return this.negative ? `-${s}` : s;
  }

  toJSON() {
    return this.toString();
  }
}

// ---------------------------------------------------------------------------
// Offset string parsing (uses Duration)
// ---------------------------------------------------------------------------

/**
 * Optional `now` prefix, optional sign, ISO 8601 duration body. The `now`
 * prefix and the `+`/`-` sign are both optional individually but collectively
 * disambiguate from a bare ISO date (which never starts with `P`).
 */
const OFFSET_RE = /^(?:now)?\s*(?:([+-])\s*)?(P\S+)$/;

/**
 * Parse a relative offset string like `'now+P1D'`, `'-PT30M'`, or `'P1D'`.
 * Returns the parsed `Duration` (with the prefix sign applied) or `null` if
 * the string is not an offset.
 */
function parseOffset(s: string): Duration | null {
  const m = OFFSET_RE.exec(s.trim());
  if (!m) return null;
  const [, sign, durStr] = m;
  let d: Duration;
  try {
    d = Duration.parse(durStr);
  } catch {
    return null;
  }
  return sign === '-' ? d.negate() : d;
}

/**
 * Resolve a `DateInput | undefined` to a `Date`. See `DateInput` for the
 * accepted shapes. `undefined` → now.
 */
function resolveDate(input: DateInput | undefined): Date {
  if (input === undefined) return new Date();
  if (input instanceof Date) return input;
  if (input instanceof Duration) return input.addTo(new Date());
  if (isNumber(input)) return new Date(Date.now() + input);
  if (input === 'now') return new Date();
  const offset = parseOffset(input);
  if (offset !== null) return offset.addTo(new Date());
  return new Date(input);
}

/**
 * Value must be strictly before `params`. `params === undefined` means "now"
 * (resolved at decode time). Has no effect when the instance is not a
 * date-like value.
 */
export const IsBefore = createFieldSchemaDecoratorFactory(
  'IsBefore',
  (value?: DateInput, options?: ValidateOptions): FieldSchemaDecorator<DateInput | undefined> => {
    return FieldSchema<DateInput | undefined>(IsBefore, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be before .value',
    decode: ({ value, params }) => {
      return !(value instanceof Date) || value <= resolveDate(params);
    },
  },
);

/**
 * Value must be strictly after `params`. `params === undefined` means "now"
 * (resolved at decode time). Has no effect when the instance is not a
 * date-like value.
 */
export const IsAfter = createFieldSchemaDecoratorFactory(
  'IsAfter',
  (value?: DateInput, options?: ValidateOptions): FieldSchemaDecorator<DateInput | undefined> => {
    return FieldSchema<DateInput | undefined>(IsAfter, value, options);
  },
  {
    phase: Phase.Semantics,
    message: '.label must be after .value',
    decode: ({ value, params }) => {
      return !(value instanceof Date) || value >= resolveDate(params);
    },
  },
);

/**
 * Date field. Composes `Info`, `IsBefore`, `IsAfter` as deps.
 *
 * `decode` (Phase.Type) accepts `Date`, ISO `string`, or `number` (ms since
 * epoch) and `provide`s a `Date` instance to downstream rules. `encode`
 * serializes the `Date` according to `params` (the chosen `DateFormat`).
 *
 * When `schema.type` is `false`, `Dummy` replaces the type assertion (for
 * `AllOf` compositions).
 */
export const IsDate = createFieldSchemaDecoratorFactory(
  'IsDate',
  (schema: DateOptions = {}): FieldSchemaDecorator<DateOptions> => {
    if (schema.inputFormat?.includes('unix') && schema.inputFormat?.includes('unix-ms')) {
      throw new Error(`Cannot accept both unix and unix-ms at the same time`);
    }
    const { before, after, default: _default, ...options } = schema;
    const [opts, info] = decoupleTypeOptions(options);
    const deps: FieldSchemaDecorator[] = [Info(info), IsInstanceOf(Date)];
    deps.push(options.format === 'unix' || options.format === 'unix-ms' ? IsNumber() : IsString());
    if (_default) deps.push(DefaultDate(...ofValueField(_default)));
    if (before !== undefined) deps.push(IsBefore(...ofValueField(before)));
    if (after !== undefined) deps.push(IsAfter(...ofValueField(after)));
    return FieldSchema<DateOptions>(IsDate, schema, opts, deps);
  },
  {
    phase: Phase.Coercion,
    message: '.label must be a valid date',
    decode: ({ value, provide, params: { format = 'iso', inputFormat = [format] } }) => {
      if (value instanceof Date) return isNumber(value.getTime());
      for (const fmt of inputFormat) {
        let parsed: Date | undefined;
        switch (fmt) {
          case 'iso':
            if (isString(value)) parsed = new Date(value);
            break;
          case 'date':
            // Strict YYYY-MM-DD; parsed as UTC midnight to avoid local-tz drift.
            if (isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              parsed = new Date(value + 'T00:00:00');
            }
            break;
          case 'unix':
            if (isNumber(value)) parsed = new Date(value * 1000);
            break;
          case 'unix-ms':
            if (isNumber(value)) parsed = new Date(value);
            break;
        }
        if (parsed) {
          return isNumber(parsed.getTime()) && provide(parsed);
        }
      }
      return true;
    },
    encode: ({ format = 'iso' }, value) => {
      if (!(value instanceof Date)) return value;
      switch (format) {
        case 'date':
          return value.toISOString().slice(0, 10);
        case 'unix':
          return Math.floor(value.getTime() / 1000);
        case 'unix-ms':
          return value.getTime();
        case 'iso':
        default:
          return value.toISOString();
      }
    },
    toJsonSchema: ({ format = 'iso' }) => {
      if (format === 'iso') return { type: 'date-time' };
      if (format === 'date') return { type: 'date' };
      return void 0;
    },
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      if (schema.format === 'date') return IsDate({ format: 'date' });
      if (schema.format === 'date-time') return IsDate({ format: 'iso' });
      return void 0;
    },
  },
);

/**
 * Provide a default `Date` when the input is `undefined`. Unlike `Default`,
 * the `DateInput` is resolved at *decode* time — `DefaultDate('now')` yields
 * the current moment of every decode, not the moment the class was loaded.
 *
 * Accepts everything `DateInput` accepts (see its docs). Useful values:
 * - `'now'` — current time at decode.
 * - `'now+P1D'` / `'-PT1H'` / `Duration.parse(...)` — relative to now.
 * - a `Date` instance or absolute date string — fixed default (re-emitted as
 *   the same `Date`).
 *
 * JSON Schema serialization normalizes to a string form:
 * - `string` → as-is (preserves `'now+P1D'` semantics across export/import).
 * - `Date` → ISO 8601 string.
 * - `Duration` / `number` (ms offset) → `'now±P…'` / `'now±PT…S'`.
 *
 * `fromJsonSchema` only round-trips string defaults — numeric defaults are
 * ambiguous (timestamp vs. offset) and are left for `Default` to consume.
 */
export const DefaultDate = createFieldSchemaDecoratorFactory(
  'DefaultDate',
  (value: DateInput, options?: ValidateOptions): FieldSchemaDecorator<DateInput> => {
    return FieldSchema<DateInput>(DefaultDate, value, options);
  },
  {
    phase: Phase.Defaults,
    message: '',
    decode: ({ value, params, provide }) => value !== void 0 || provide(resolveDate(params)),
    toJsonSchema: (params) => {
      if (isString(params)) return { default: params };
      if (params instanceof Date) return { default: params.toISOString() };
      if (params instanceof Duration) {
        const s = params.toString();
        return { default: s.startsWith('-') ? `now${s}` : `now+${s}` };
      }
      if (isNumber(params)) {
        const sign = params >= 0 ? '+' : '-';
        return { default: `now${sign}PT${Math.abs(params) / 1000}S` };
      }
      return void 0;
    },
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      if (
        schema.default !== void 0 &&
        (schema.format === 'date' ||
          schema.format === 'date-time' ||
          (isString(schema.default) && schema.default.startsWith('now')))
      ) {
        return DefaultDate(schema.default as string);
      }
      return void 0;
    },
  },
);

/**
 * Duration field. Accepts an ISO 8601 duration string and `provide`s a parsed
 * `Duration` instance to downstream rules. `Duration` instances pass through.
 *
 * `encode` serializes a `Duration` back to its canonical ISO 8601 form.
 * JSON Schema is `{ type: 'string', format: 'duration' }`.
 */
export const IsDuration = createFieldSchemaDecoratorFactory(
  'IsDuration',
  (options: ValidateOptions = {}): FieldSchemaDecorator<undefined> => {
    return FieldSchema<undefined>(IsDuration, void 0, options, [
      IsString(),
      IsInstanceOf(Duration),
    ]);
  },
  {
    phase: Phase.Type,
    message: '.label must be a valid ISO 8601 duration',
    decode: ({ value, provide }) => {
      return !isString(value) || provide(Duration.parse(value));
    },
    toJsonSchema: () => ({ format: 'duration' }),
    fromJsonSchema: (schema): FieldSchemaDecorator | undefined => {
      return schema.format === 'duration' ? IsDuration() : void 0;
    },
  },
);

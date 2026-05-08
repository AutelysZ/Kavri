```ts
// A class constructor used as a schema/message type.
export type SchemaClass<T = unknown> = abstract new (...args: never[]) => T;

// A lazy class reference, mainly for circular object graphs.
export type SchemaRef<T = unknown> = SchemaClass<T> | (() => SchemaClass<T>);

// A string path segment for nested validation errors.
export type SchemaPath = readonly (string | number)[];

// Shared options for rules that can customize user-facing error output.
export interface RuleMessageOptions {
  // Human label used in generated errors instead of the field name.
  label?: string;

  // Full error-message override. May reference implementation-defined placeholders.
  message?: string;
}

// Class-level schema metadata. This describes the message as a whole.
export interface SchemaOptions {
  // Stable schema name. Defaults to the class name.
  name?: string;

  // Human title for generated JSON Schema/OpenAPI docs.
  title?: string;

  // Human description for generated JSON Schema/OpenAPI docs.
  description?: string;

  // Optional stable JSON Schema id.
  id?: string;

  // Mark the schema deprecated. Must explain why and what to use instead.
  deprecated?: string;
}

// Marks a class as a Kavri schema/message.
// Only decorated fields participate in validation, decoding, encoding, and docs.
export function Schema(options?: SchemaOptions): ClassDecorator;

// Runtime description of a schema class after decorators are collected.
export interface SchemaDescription<T = unknown> {
  // Original class constructor.
  type: SchemaClass<T>;

  // Resolved schema options.
  options: Required<Pick<SchemaOptions, 'name'>> & Omit<SchemaOptions, 'name'>;

  // Ordered field descriptions.
  fields: readonly FieldDescription[];

  // Lookup by public field name.
  field(name: string): FieldDescription | undefined;
}

// Runtime description of one schema field.
export interface FieldDescription {
  // JavaScript property key.
  key: string | symbol;

  // Public serialized field name. Defaults to String(key).
  name: string;

  // Ordered rules applied to this field.
  rules: readonly RuleDescription[];

  // Whether missing/undefined input is accepted.
  optional: boolean;

  // Whether null input is accepted.
  nullable: boolean;

  // Where this field is read from in an HTTP request.
  source?: FieldSource;
}

// Request/source placement for transport-aware schemas.
export type FieldSource =
  | { kind: 'body' }
  | { kind: 'query'; name?: string }
  | { kind: 'header'; name?: string }
  | { kind: 'path'; name?: string }
  | { kind: 'rawBody' };

// Returns the canonical schema description for a class.
export function describe<T>(type: SchemaClass<T>): SchemaDescription<T>;

// A field rule decorator.
export type RuleDecorator<T = unknown> = PropertyDecorator & {
  readonly rule: RuleDescription<T>;
};

// Runtime description of one rule attached to a field.
export interface RuleDescription<T = unknown> {
  // Stable rule identifier, e.g. "string", "minLength", "email".
  name: string;

  // Rule-specific parameters.
  params: T;

  // Rule execution phase.
  phase: RulePhase;

  // User-facing error options.
  message?: RuleMessageOptions;
}

// Ordered validation/decode phases.
export type RulePhase =
  | 'presence'
  | 'default'
  | 'type'
  | 'coerce'
  | 'normalize'
  | 'semantic'
  | 'children'
  | 'composition'
  | 'encode';

// Context passed to custom rule implementations.
export interface RuleContext<TParams = unknown> {
  // Current path in the input graph.
  path: SchemaPath;

  // Current field/value name.
  name?: string;

  // Original root input.
  root: unknown;

  // Parent object/array value.
  parent: unknown;

  // Current value. Rules may replace it through provide().
  value: unknown;

  // Rule parameters.
  params: TParams;

  // Shared per-decode state.
  state: Map<unknown, unknown>;

  // Replace the current value for later rules.
  provide(value: unknown): RuleResult;

  // Decode a nested value with another schema/rule list.
  child(schema: SchemaInput, value: unknown, path: string | number): DecodeResult;
}

// Result returned by a rule implementation.
export type RuleResult = boolean | string | DecodeResult | readonly DecodeResult[] | void;

// Custom rule definition.
export interface RuleDefinition<TParams = unknown> {
  // Stable public name.
  name: string;

  // Execution phase.
  phase: RulePhase;

  // Default error message.
  message?: string | ((ctx: RuleContext<TParams>) => string);

  // Decode/validate/coerce implementation.
  decode?: (ctx: RuleContext<TParams>) => RuleResult | Promise<RuleResult>;

  // Convert this rule into JSON Schema keywords.
  toJsonSchema?: (params: TParams, current: JsonSchema) => JsonSchema | void;

  // Reconstruct this rule from JSON Schema.
  fromJsonSchema?: (ctx: FromJsonSchemaContext) => RuleDecorator | void;

  // Encode a runtime value to plain JSON/output.
  encode?: (params: TParams, value: unknown, ctx: EncodeContext) => unknown;
}

// Creates a custom field rule decorator factory.
export function defineRule<TParams>(
  definition: RuleDefinition<TParams>,
): (params: TParams, options?: RuleMessageOptions) => RuleDecorator<TParams>;

// Anything accepted as a schema for one value.
export type SchemaInput =
  | SchemaClass
  | RuleDecorator
  | RuleDescription
  | readonly (RuleDecorator | RuleDescription)[];

// Decode success/failure container.
export type DecodeResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: DecodeError };

// Structured decode error.
export class DecodeError extends Error {
  // Root schema/input that failed.
  readonly schema: SchemaInput;

  // All validation issues.
  readonly issues: readonly DecodeIssue[];
}

// One validation issue.
export interface DecodeIssue {
  // Path to the invalid value.
  path: SchemaPath;

  // Rule that failed.
  rule: string;

  // User-facing message.
  message: string;

  // Invalid received value.
  value: unknown;

  // Rule parameters.
  params?: unknown;
}

// Decode input and return a result object.
export function decode<T>(schema: SchemaClass<T>, input: unknown): DecodeResult<T>;
export function decode<T = unknown>(schema: SchemaInput, input: unknown): DecodeResult<T>;

// Decode input and throw DecodeError on failure.
export function parse<T>(schema: SchemaClass<T>, input: unknown): T;
export function parse<T = unknown>(schema: SchemaInput, input: unknown): T;

// Assert that an input matches a schema.
export function assert<T>(schema: SchemaClass<T>, input: unknown): asserts input is T;

// Encode runtime data to plain JSON-compatible output.
export function encode<T>(schema: SchemaClass<T>, value: T): unknown;

// JSON.stringify replacer that delegates to encode metadata when possible.
export function jsonReplacer(this: unknown, key: string, value: unknown): unknown;

// Minimal JSON Schema 2020-12 shape accepted/emitted by Kavri.
export interface JsonSchema {
  [keyword: string]: unknown;
}

// Context passed to JSON Schema reconstruction.
export interface FromJsonSchemaContext {
  // Current JSON Schema node.
  schema: JsonSchema;

  // Rules already reconstructed for this node.
  current: readonly RuleDecorator[];

  // Reconstruct a nested JSON Schema node.
  fromJsonSchema(schema: JsonSchema): SchemaInput;

  // Whether the current JSON Schema node has the given type.
  hasType(type: string): boolean;
}

// Context passed to encode hooks.
export interface EncodeContext {
  // Current path in the encoded object graph.
  path: SchemaPath;

  // Current field name.
  name?: string;

  // Root value being encoded.
  root: unknown;

  // Parent object/array value.
  parent: unknown;
}

// Convert a schema class or field schema to JSON Schema.
export function toJsonSchema(schema: SchemaInput): JsonSchema;

// Result of converting JSON Schema back into Kavri schema/rules.
export interface FromJsonSchemaResult {
  // Object schemas become generated classes; scalar schemas become rule arrays.
  root: SchemaClass | readonly RuleDecorator[];

  // Decoded $defs by name.
  defs: ReadonlyMap<string, SchemaClass | readonly RuleDecorator[]>;
}

// Convert JSON Schema into Kavri schema/rules.
export function fromJsonSchema(schema: JsonSchema): FromJsonSchemaResult;

// Field naming/metadata.
export function Field(name?: string): RuleDecorator;

// Presence/default rules.
export function Optional(options?: RuleMessageOptions): RuleDecorator;
export function Nullable(options?: RuleMessageOptions): RuleDecorator;
export function Default<T>(value: T, options?: RuleMessageOptions): RuleDecorator<T>;
export function Const<T>(value: T, options?: RuleMessageOptions): RuleDecorator<T>;

// Primitive type rules.
export function String(options?: StringRuleOptions): RuleDecorator;
export function Number(options?: NumberRuleOptions): RuleDecorator;
export function Integer(options?: NumberRuleOptions): RuleDecorator;
export function Boolean(options?: RuleMessageOptions): RuleDecorator;
export function BigInt(options?: NumberRuleOptions): RuleDecorator;
export function DateTime(options?: DateRuleOptions): RuleDecorator<Date>;
export function Duration(options?: DurationRuleOptions): RuleDecorator;

// Coercion/normalization rules.
export function ToString(options?: StringRuleOptions): RuleDecorator;
export function ToNumber(options?: NumberRuleOptions): RuleDecorator;
export function ToInteger(options?: NumberRuleOptions): RuleDecorator;
export function ToBoolean(options?: RuleMessageOptions): RuleDecorator;
export function ToBigInt(options?: NumberRuleOptions): RuleDecorator;
export function Trim(options?: RuleMessageOptions): RuleDecorator;
export function Lowercase(options?: RuleMessageOptions): RuleDecorator;
export function Uppercase(options?: RuleMessageOptions): RuleDecorator;

// String validation options.
export interface StringRuleOptions extends RuleMessageOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: string | RegExp;
  format?: string;
  allowEmpty?: boolean;
}

// Numeric validation options.
export interface NumberRuleOptions extends RuleMessageOptions {
  minimum?: number | bigint;
  maximum?: number | bigint;
  exclusiveMinimum?: number | bigint;
  exclusiveMaximum?: number | bigint;
  multipleOf?: number | bigint;
}

// Date validation options.
export interface DateRuleOptions extends RuleMessageOptions {
  format?: 'date-time' | 'date' | 'unix' | 'unix-ms';
  before?: Date | string | number;
  after?: Date | string | number;
}

// Duration validation options.
export interface DurationRuleOptions extends RuleMessageOptions {
  minimum?: Duration;
  maximum?: Duration;
}

// Object rules.
export function ObjectOf<T extends object>(
  fields?: Record<keyof T & string, SchemaInput>,
  options?: ObjectRuleOptions<T>,
): RuleDecorator;

export interface ObjectRuleOptions<T extends object = object> extends RuleMessageOptions {
  additionalProperties?: boolean | SchemaInput;
  unevaluatedProperties?: boolean | SchemaInput;
  minProperties?: number;
  maxProperties?: number;
  required?: readonly (keyof T & string)[];
}

// Reference to another schema class.
export function Ref<T>(type: SchemaRef<T>, options?: RuleMessageOptions): RuleDecorator<T>;

// Record/map rules.
export function RecordOf(value: SchemaInput, options?: ObjectRuleOptions): RuleDecorator;
export function MapOf(
  key: SchemaInput,
  value: SchemaInput,
  options?: RuleMessageOptions,
): RuleDecorator;

// Array rules.
export function ArrayOf(item: SchemaInput, options?: ArrayRuleOptions): RuleDecorator;
export function TupleOf(items: readonly SchemaInput[], options?: ArrayRuleOptions): RuleDecorator;

export interface ArrayRuleOptions extends RuleMessageOptions {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: SchemaInput;
  minContains?: number;
  maxContains?: number;
  unevaluatedItems?: false | SchemaInput;
}

// Composition rules.
export function AnyOf(schemas: readonly SchemaInput[], options?: RuleMessageOptions): RuleDecorator;
export function OneOf(schemas: readonly SchemaInput[], options?: RuleMessageOptions): RuleDecorator;
export function AllOf(schemas: readonly SchemaInput[], options?: RuleMessageOptions): RuleDecorator;
export function Not(schema: SchemaInput, options?: RuleMessageOptions): RuleDecorator;

export function If(
  condition: SchemaInput,
  branches: { then?: SchemaInput; else?: SchemaInput },
  options?: RuleMessageOptions,
): RuleDecorator;

// Enum rules.
export function EnumOf<T extends readonly unknown[]>(
  values: T,
  options?: RuleMessageOptions,
): RuleDecorator<T[number]>;

export function NativeEnum<T extends Record<string, string | number>>(
  value: T,
  options?: RuleMessageOptions,
): RuleDecorator<T[keyof T]>;

// Common string semantic rules.
export function Email(options?: RuleMessageOptions): RuleDecorator;
export function Url(options?: RuleMessageOptions): RuleDecorator;
export function Uuid(options?: { version?: 3 | 4 | 5 | 7 } & RuleMessageOptions): RuleDecorator;
export function Ip(options?: { version?: 4 | 6 } & RuleMessageOptions): RuleDecorator;
export function Hostname(options?: RuleMessageOptions): RuleDecorator;
export function MimeType(options?: RuleMessageOptions): RuleDecorator;
export function SemVer(options?: RuleMessageOptions): RuleDecorator;
export function StrongPassword(options?: StrongPasswordOptions): RuleDecorator;

export interface StrongPasswordOptions extends RuleMessageOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
}

// Encoding/content rules.
export function Base64(options?: RuleMessageOptions): RuleDecorator;
export function Base58(options?: RuleMessageOptions): RuleDecorator;
export function Base32(options?: RuleMessageOptions): RuleDecorator;
export function JsonContent(schema?: SchemaInput, options?: RuleMessageOptions): RuleDecorator;

// Binary/file abstractions.
export interface FileValue {
  name: string;
  size: number;
  type?: string;
  stream?: unknown;
  path?: string;
}

export interface BinaryValue {
  size: number;
  stream?: unknown;
  bytes?: Uint8Array;
  path?: string;
}

// File upload field.
export function File(options?: FileRuleOptions): RuleDecorator<FileValue>;

// Binary value field.
export function Binary(options?: BinaryRuleOptions): RuleDecorator<BinaryValue>;

// Raw request body marker. Only valid in route request schemas.
export function RawBody(options?: BinaryRuleOptions): RuleDecorator<BinaryValue>;

// Filename/path validation.
export function Filename(options?: FilenameRuleOptions): RuleDecorator<string>;

export interface FileRuleOptions extends RuleMessageOptions {
  accept?: readonly string[];
  maxSize?: number;
  multiple?: boolean | ArrayRuleOptions;
}

export interface BinaryRuleOptions extends RuleMessageOptions {
  maxSize?: number;
  contentType?: string;
}

export interface FilenameRuleOptions extends RuleMessageOptions {
  kind?: 'name' | 'relative' | 'absolute' | 'path';
  accept?: readonly string[];
}

// HTTP field placement.
export function Query(name?: string): RuleDecorator;
export function Header(name?: string): RuleDecorator;
export function Path(name?: string): RuleDecorator;
export function Body(): RuleDecorator;

// HTTP methods.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

// HTTP operation declaration.
export interface Operation<TRequest = unknown, TResponse = unknown> {
  method: HttpMethod;
  path?: string;
  request?: SchemaClass<TRequest>;
  response?: SchemaClass<TResponse>;
  options?: OperationOptions;
}

// HTTP operation metadata.
export interface OperationOptions {
  summary?: string;
  description?: string;
  deprecated?: string;
  tags?: readonly string[];
  status?: number;
  requestType?: string;
  responseType?: string;
  maxBodySize?: number;
  idempotency?: 'safe' | 'idempotent' | 'volatile';
}

// HTTP route declaration.
export interface Route<T extends Record<string, Operation> = Record<string, Operation>> {
  name: string;
  path: string;
  operations: T;
  options?: RouteOptions;
}

// Route-level metadata.
export interface RouteOptions {
  summary?: string;
  description?: string;
  deprecated?: string;
}

// Define a route as plain typed data.
export function route<T extends Record<string, Operation>>(definition: Route<T>): Route<T>;

// Operation builders.
export function get<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

export function post<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

export function put<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

export function patch<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

export function del<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

export function head<TReq, TRes>(
  request?: SchemaClass<TReq>,
  response?: SchemaClass<TRes>,
  path?: string,
  options?: OperationOptions,
): Operation<TReq, TRes>;

// OpenAPI document shape.
export interface OpenApiDocument {
  [key: string]: unknown;
}

// Generate OpenAPI 3.1 from routes.
export function toOpenApi(routes: readonly Route[], options: OpenApiOptions): OpenApiDocument;

export interface OpenApiOptions {
  title: string;
  version: string;
  description?: string;
  servers?: readonly { url: string; description?: string }[];
}

// WebSocket message declaration.
export interface SocketMessage<TPayload = unknown> {
  payload?: SchemaClass<TPayload>;
  options?: SocketMessageOptions;
}

// WebSocket message metadata.
export interface SocketMessageOptions {
  type?: string;
  summary?: string;
  description?: string;
  deprecated?: string;
  codec?: string;
  maxSize?: number;
}

// WebSocket protocol declaration.
export interface SocketProtocol<
  TRequest = unknown,
  TIn extends Record<string, SocketMessage> = Record<string, SocketMessage>,
  TOut extends Record<string, SocketMessage> = Record<string, SocketMessage>,
> {
  name: string;
  path: string;
  request?: SchemaClass<TRequest>;
  inbound: TIn;
  outbound: TOut;
  options?: SocketProtocolOptions;
}

export interface SocketProtocolOptions {
  summary?: string;
  description?: string;
  deprecated?: string;
  codec?: string;
  maxSize?: number;
}

// Define one WebSocket message.
export function message<T>(
  payload?: SchemaClass<T>,
  options?: SocketMessageOptions,
): SocketMessage<T>;

// Define a WebSocket protocol as plain typed data.
export function socket<
  TRequest,
  TIn extends Record<string, SocketMessage>,
  TOut extends Record<string, SocketMessage>,
>(definition: SocketProtocol<TRequest, TIn, TOut>): SocketProtocol<TRequest, TIn, TOut>;

// Schema class reshaping helpers.
export function pick<T, K extends keyof T>(
  type: SchemaClass<T>,
  keys: readonly K[],
): SchemaClass<Pick<T, K>>;

export function omit<T, K extends keyof T>(
  type: SchemaClass<T>,
  keys: readonly K[],
): SchemaClass<Omit<T, K>>;

export function partial<T>(type: SchemaClass<T>): SchemaClass<Partial<T>>;
export function partial<T, K extends keyof T>(
  type: SchemaClass<T>,
  keys: readonly K[],
): SchemaClass<Omit<T, K> & Partial<Pick<T, K>>>;

export function required<T>(type: SchemaClass<T>): SchemaClass<Required<T>>;
export function required<T, K extends keyof T>(
  type: SchemaClass<T>,
  keys: readonly K[],
): SchemaClass<Omit<T, K> & Required<Pick<T, K>>>;

export function merge<T extends readonly SchemaClass[]>(
  types: T,
): SchemaClass<UnionToIntersection<InstanceType<T[number]>>>;
```

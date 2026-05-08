# Schema Design v2

Package: `@kavri/schema`

Status: design proposal for the current package scope. This document intentionally keeps the
implemented feature envelope: class schemas, field decorators, decode/coercion, JSON Schema
round-trip, route descriptions, OpenAPI generation/import, WebSocket descriptions, schema reshaping,
file/binary markers, and custom decorator factories.

The goal is not to make Kavri a general validation library clone. The goal is to make class-based
message schemas predictable enough to share across server, client, documentation, and transport
adapters.

## 1. Problems With The Current Shape

The current implementation has good raw ingredients but the public model is not crisp enough.

- `FieldSchemaDecoratorFactory` is too visible. Users should rarely need to understand phases,
  strategies, registry mutation, or `DecodeContext` internals.
- Decorator options are inconsistent. Some decorators accept a schema object first, some accept a
  value then options, and route decorators are field decorators but not schema decorator factories.
- `decode()` returns a result object but there is no high-level `parse()` helper for the common
  "throw or return typed instance" path.
- JSON Schema conversion accepts several useful runtime inputs, but the conceptual input type is not
  named as a public API.
- `@Schema()` class metadata and field metadata are loosely connected. Required-by-default behavior
  is implemented by consumers such as OpenAPI, not by a single schema description API.
- Route and WebSocket definitions are good identity helpers, but their names are transport-centric
  enough that they should remain declarative data, not validation logic.
- The old design doc describes unimplemented or outdated API forms (`parse`, `json`, `defineSchema`,
  older route signatures), which makes it hard to know what is stable.

## 2. Design Principles

1. **Classes define messages.** A schema class is a named message shape. Field decorators define the
   fields that participate. Undecorated fields are ignored.
2. **Decorators are metadata plus behavior.** A field decorator contributes typed metadata, decode
   behavior, encode behavior, and JSON Schema behavior through one channel.
3. **Required by default.** A decorated field is required unless `IsOptional`, `IsNullable`, or a
   default rule short-circuits presence.
4. **Decode is deterministic.** Rules run in stable phases. Type/coercion/presence semantics must be
   explainable without reading decorator source.
5. **Transport is declarative.** HTTP routes, OpenAPI, WebSocket messages, files, and raw bodies are
   described by schemas and metadata. Runtime web packages may consume this metadata later.
6. **Compatibility first.** Existing names should continue to work. V2 may add clearer aliases and
   higher-level helpers, but should not break decorator call sites unnecessarily.
7. **Small public core, large decorator catalog.** Internal pipeline types stay available for custom
   decorators, but everyday users should mostly use `@Schema`, field decorators, `decode`, `parse`,
   `toJsonSchema`, route builders, and reshape helpers.

## 3. Public API Layers

V2 should document the package as five layers.

### 3.1 Message Schema Layer

```ts
export interface SchemaOptions<T extends object = object> extends ObjectOptions<T> {
  slug?: string;
}

export function Schema<T extends object = object>(
  options?: SchemaOptions<T>,
): ClassDecorator<SchemaOptions<T>>;

export function describeSchema<T extends object>(
  target: AnyConstructor<T> | T,
): SchemaDescription<T>;

export function getSchema<T extends object>(
  target: AnyConstructor<T> | T,
): SchemaDescription<T> | undefined;

export interface SchemaDescription<T extends object = object> extends SchemaOptions<T> {
  properties: ReadonlyMap<keyof T & string, readonly FieldRule[]>;
  required: readonly (keyof T & string)[];
}
```

Compatibility:

- Keep `Schema()` and `getSchema()`.
- `getSchema()` may keep returning an object-like shape for compatibility, but v2 should prefer
  `describeSchema()` as the canonical introspection API.
- `SchemaOptions` should replace the currently internal `SchemaMetadata` name in docs.

Decision:

- Decorated fields are the source of truth. `@Schema({ properties })` may add object-level JSON
  Schema metadata, but it must not invent validation for undecorated class fields.
- `describeSchema()` should compute required fields once from field rules and expose a stable
  readonly view. OpenAPI, JSON Schema, decode, and reshape should depend on this same view.

### 3.2 Rule And Decorator Layer

Every field decorator contributes a `FieldRule`.

```ts
export interface FieldRule<P = unknown> {
  readonly factory: FieldRuleFactory<P>;
  readonly params: P;
  readonly options?: RuleOptions;
}

export interface RuleOptions {
  label?: string;
  message?: string;
}

export type FieldRuleInput =
  | FieldSchemaDecorator
  | FieldRule
  | readonly (FieldSchemaDecorator | FieldRule)[];

export type FieldSchemaDecorator<P = unknown> = FieldDecorator<FieldRule<P>>;
```

Compatibility:

- Keep `ValidateOptions`, `ValidateField`, `NestedFieldSchema`,
  `FieldSchemaDecoratorMetadata`, `FieldSchemaDecoratorFactory`, and `FieldSchema()` as aliases or
  low-level names.
- Add clearer public aliases: `RuleOptions`, `RuleValue<T>`, `FieldRule`, `FieldRuleFactory`,
  `FieldRuleInput`.
- The current `NestedFieldSchema` is too narrow because the implementation already accepts metadata
  arrays in useful places. V2 should formalize that as `FieldRuleInput`.

Decision:

- Use "rule" in documentation for the thing that runs in the pipeline.
- Use "decorator" for the JavaScript decorator value applied to a class field.
- Keep factory statics public for custom rule authors, but mark phase/strategy APIs as advanced.

### 3.3 Decode Layer

```ts
export class DecodeResult<T = unknown> {
  readonly ok: boolean;
  get value(): T;
  get issue(): DecodeIssue;
}

export interface DecodeIssue {
  issues?: readonly RuleIssue[];
  children?: readonly FieldIssue[];
}

export interface FieldIssue extends DecodeIssue {
  field: string;
}

export interface RuleIssue {
  rule: string;
  params: unknown;
  message: string;
}

export function decode<T>(schema: AnyConstructor<T>, input: unknown): DecodeResult<T>;
export function decode<T>(schema: FieldRuleInput, input: unknown): DecodeResult<T>;
export function parse<T>(schema: AnyConstructor<T>, input: unknown): T;
export function parse<T>(schema: FieldRuleInput, input: unknown): T;
export function assertValid<T>(schema: AnyConstructor<T>, input: unknown): asserts input is T;
```

Compatibility:

- Keep `decode()` returning `DecodeResult`.
- Add `parse()` as the ergonomic throwing API.
- Add `DecodeError extends Error` for `parse()` failures. It should carry the same issue tree as
  `DecodeResult.issue`.
- Keep `DecodeContext` public only for custom rule authors.

Decision:

- `decode(class, input)` returns a class instance with the target prototype when successful.
- `decode(ruleInput, input)` returns the decoded/coerced value.
- Presence rules short-circuit success (`IsOptional`, `IsNullable`, `Default`). This is current
  behavior and should remain.
- Coercion rules may replace `ctx.value` with `provide(value)`. They must not silently swallow
  invalid coercions; the subsequent type rule should fail.

### 3.4 JSON, OpenAPI, And Transport Layer

```ts
export type JsonSchemaInput = AnyConstructor | FieldRuleInput;

export function toJsonSchema(input: JsonSchemaInput): JsonSchema;
export function fromJsonSchema(input: JsonSchema | readonly JsonSchema[]): FromJsonSchemaResult;

export function jsonReplacer(this: unknown, value: unknown, key: string): unknown;
export function toJson<T>(value: T): unknown;
```

Compatibility:

- Keep `toJsonSchema()` and `fromJsonSchema()`.
- Keep `jsonReplacer()` but document it as incomplete until encode traversal is implemented.
- Add `toJson()` once encoding traversal exists. It should use rule `encode` hooks and preserve
  field-level schema rules.

Decision:

- `toJsonSchema(class)` emits an object schema.
- `toJsonSchema(ruleInput)` emits the schema for one value or field.
- `fromJsonSchema()` returns synthesized classes for object schemas and rule arrays for scalar
  schemas. It should continue to return `{ root, defs }`.
- Miswired `fromJsonSchema` rule factories must not be silently swallowed in production mode. V2
  should make this configurable:

```ts
export interface FromJsonSchemaOptions {
  onFactoryError?: 'throw' | 'skip';
}
```

Default should be `'throw'` for explicit failures. A compatibility wrapper can use `'skip'`.

### 3.5 Protocol Definition Layer

HTTP and WebSocket definitions are schema-adjacent declarations. They do not validate by
themselves.

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

export interface Operation<TReq = unknown, TRes = unknown> extends OperationOptions {
  method: HttpMethod;
  request: AnyConstructor<TReq> | null;
  response: AnyConstructor<TRes> | null;
}

export interface RouteDefinition<
  T extends Record<string, Operation> = Record<string, Operation>,
> extends RouteSharedOptions {
  name: string;
  path: string;
  operations: T;
}

export function defineRoute<T extends Record<string, Operation>>(
  def: RouteDefinition<T>,
): RouteDefinition<T>;

export function toOpenAPIv3(
  routes: readonly RouteDefinition[],
  extra?: Partial<OpenAPIv3>,
): OpenAPIv3;

export function fromOpenAPIv3(spec: OpenAPIv3): RouteDefinition[];
```

Compatibility:

- Keep the current `defineRoute({ name, path, operations })` identity helper.
- Keep `get`, `post`, `put`, `del`, `patch`, `head`.
- Keep `null` for no request/response. Do not reintroduce `'void'`; it is noisier than `null` and
  less TypeScript-friendly.

Decision:

- OpenAPI generation owns the policy for request placement:
  - `InQuery` and `InHeader` become parameters.
  - `RawBody` owns the request body.
  - `IsFile` implies multipart form data.
  - Remaining request fields become structured body fields.
- A request field should never be in more than one placement. V2 should add explicit errors for
  contradictory route metadata.

WebSocket definitions stay parallel:

```ts
export interface Message<TPayload = unknown> extends MessageOptions {
  payload: AnyConstructor<TPayload> | null;
}

export interface WebSocketDefinition<
  TReq = unknown,
  TIn extends Record<string, Message> = Record<string, Message>,
  TOut extends Record<string, Message> = Record<string, Message>,
> extends WebSocketSharedOptions {
  name: string;
  path: string;
  request?: AnyConstructor<TReq>;
  inbound: TIn;
  outbound: TOut;
}
```

Compatibility:

- Keep `message(payload, discriminatorOrOptions?, options?)`.
- Keep `defineWebSocket(def)` as an identity helper.

## 4. Decorator Catalog

V2 should keep the current decorator coverage, but group it more clearly.

### 4.1 Base Rules

- `Info`
- `Examples`
- `Deprecated`
- `Default`
- `IsOptional`
- `IsNullable`
- `IsConst`

Policy:

- `Info` contributes JSON Schema annotations only.
- `Default`, `IsOptional`, and `IsNullable` are presence-phase rules.
- `Deprecated` should require a non-empty reason in public helpers, matching the project error
  philosophy.

### 4.2 Primitive Type Rules

- Strings: `IsString`, `MinLength`, `MaxLength`, `Pattern`, `AllowEmpty`, `ToString`
- Numbers: `IsInteger`, `IsNumber`, `ToBigInt`, `ToNumber`, `ToInteger`, `Minimum`, `Maximum`,
  `ExclusiveMinimum`, `ExclusiveMaximum`, `MultipleOf`
- Booleans: `IsBoolean`, `ToBoolean`
- Time: `IsDate`, `DefaultDate`, `IsBefore`, `IsAfter`, `IsDuration`, `Duration`
- Enums: `IsEnum`

Policy:

- Type decorators accept one options object.
- Constraint decorators accept `(value, options?)`.
- Coercion decorators are named `ToX`.
- BigInt should be documented as a coercing type (`ToBigInt`) even if the registered factory name
  remains `IsBigInt` for compatibility.

### 4.3 Object And Array Rules

- Object: `IsObject`, `Properties`, `PatternProperties`, `PropertyNames`, `AdditionalProperties`,
  `UnevaluatedProperties`, `MinProperties`, `MaxProperties`, `Required`, `DependentRequired`,
  `DependentSchemas`, `IsRecord`, `IsMap`, `Ref`, `IsInstanceOf`
- Array: `IsArray`, `Items`, `PrefixItems`, `Contains`, `MinContains`, `MaxContains`, `MinItems`,
  `MaxItems`, `UniqueItems`, `UnevaluatedItems`

Policy:

- `Ref` should accept `AnyConstructor<T> | (() => AnyConstructor<T>)`. The lazy function form is
  recommended for circular references.
- Object and array rules should mark evaluated keys/items consistently so additional/unevaluated
  constraints match JSON Schema 2020-12 semantics.
- `Required` the field rule and `Required` the reshape helper currently share a name. V2 should
  avoid exporting both under one ambiguous name from the root. Preferred:
  - Keep object-rule `Required` from `decorators/object`.
  - Export reshape helper as `RequiredFields` from the root, while preserving `Required` as a
    compatibility alias.

### 4.4 Composition Rules

- `AnyOf`
- `OneOf`
- `AllOf`
- `IfThenElse`
- `Not`

Policy:

- Composition rules run after type/coercion/property phases.
- Composition failures should preserve nested child issues.
- `AllOf([...])` should not require repeated type checks; `type: false` stays supported for
  advanced composition.

### 4.5 String Semantics And Sanitizers

Keep the validator-backed catalog:

- Semantic validators such as `IsEmail`, `IsURL`, `IsUUID`, `IsIP`, `IsFQDN`, `IsStrongPassword`,
  `IsSemVer`, and the rest of the current validator.js-backed exports.
- Sanitizers such as `Trim`, `LTrim`, `RTrim`, `NormalizeEmail`, `Escape`, `Unescape`,
  `ToLowerCase`, `ToUpperCase`, `Whitelist`, `Blacklist`, `StripLow`.

Policy:

- Validators should compose `IsString` by default.
- Sanitizers should run in `Phase.Normalization`.
- Names should match validator.js where possible, but keep existing Kavri names as aliases.

### 4.6 Encoding, Content, File, And Route Field Rules

- Text encoding: `IsBase32`, `IsBase58`, `IsBase64`
- Binary/content: `IsCompressed`, `ContentSchema`, `IsJSON`
- Files/binary: `MultipartFile`, `FileUnion`, `BinaryUnion`, `IsFile`, `IsBinary`, `IsFilename`,
  `Accept`, `MaxSize`
- Route placement: `RawBody`, `InQuery`, `InHeader`

Policy:

- `IsFile`, `RawBody`, `InQuery`, and `InHeader` are placement/transport decorators, not ordinary
  schema rules. This distinction must be documented.
- `IsFile` should still compose ordinary field rules so it participates in decode and JSON Schema
  where possible.
- `RawBody` should be exclusive: at most one per request schema.
- `InQuery` and `InHeader` source names default to the field name when omitted.

## 5. Canonical Examples

### 5.1 Basic Message

```ts
@Schema({ title: 'Create user request' })
class CreateUserRequest {
  @IsString({ minLength: 1, maxLength: 80, label: 'name' })
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

const result = decode(CreateUserRequest, input);
if (!result.ok) {
  console.error(result.issue);
}

const user = parse(CreateUserRequest, input);
```

### 5.2 Nested Message

```ts
@Schema()
class Address {
  @IsString()
  city!: string;
}

@Schema()
class User {
  @Ref(() => Address)
  address!: Address;

  @IsArray({ items: Ref(() => Address), minItems: 1 })
  previousAddresses!: Address[];
}
```

### 5.3 Route

```ts
@Schema()
class ListUsersRequest {
  @InQuery()
  @ToInteger({ minimum: 1, default: 1 })
  page!: number;
}

const UserRoute = defineRoute({
  name: 'UserRoute',
  path: '/users',
  operations: {
    list: get(ListUsersRequest, UserListResponse, ''),
    create: post(CreateUserRequest, UserResponse),
  },
});

const spec = toOpenAPIv3([UserRoute], {
  info: { title: 'Users API', version: '1.0.0' },
});
```

### 5.4 WebSocket

```ts
const ChatSocket = defineWebSocket({
  name: 'Chat',
  path: '/ws/chat',
  request: HandshakeRequest,
  inbound: {
    send: message(ChatMessage, 'chat.send'),
  },
  outbound: {
    ack: message(AckMessage),
  },
});
```

### 5.5 Reshape

```ts
class RegisterUser extends Omit(User, 'id', 'createdAt', 'updatedAt') {}

class UpdateUser extends Merge([
  Pick(User, 'id'),
  Partial(Pick(User, 'name', 'email', 'displayName')),
]) {}
```

V2 compatibility aliases:

```ts
export const RequiredFields = Required;
```

The root export may keep `Required` for compatibility, but documentation should prefer
`RequiredFields` for reshaping to avoid confusion with object-rule `Required`.

## 6. Internal Pipeline Design

The current phase model is worth keeping, but it should be specified as an advanced contract.

```ts
export enum Phase {
  Info,
  Defaults,
  Presence,
  Type,
  Coercion,
  Normalization,
  TextEncoding,
  BinaryEncoding,
  ContentType,
  Semantics,
  Property,
  Composition,
  AdditionalConstraints,
}
```

Rules:

- `Info` never fails decode.
- `Defaults` and `Presence` may short-circuit successful decode.
- `Type` and `Coercion` are "any pass" within their phase.
- `Normalization`, encoding, and content phases fail fast.
- `Semantics`, `Property`, `Composition`, and `AdditionalConstraints` aggregate issues.

This keeps current behavior but gives custom rule authors a stable target.

Custom rule factory API:

```ts
export interface FieldRuleFactoryStatic<P> {
  readonly name: string;
  readonly phase: Phase;
  readonly message: string | ((ctx: DecodeContext<P>) => string);
  decode?: (ctx: DecodeContext<P>) => Awaitable<boolean | string | DecodeResult | DecodeResult[]>;
  encode?: (params: P, value: unknown, key: string, object: object) => unknown;
  toJsonSchema?: (params: P, current: JsonSchema) => JsonSchema | undefined;
  fromJsonSchema?: (ctx: FromJsonSchemaContext) => FieldSchemaDecorator | undefined;
}
```

Compatibility:

- Continue supporting the existing symbol-based `FieldSchemaDecoratorName`.
- Add a string `name` getter or helper so users do not need to read a symbol.

## 7. Error Design

Add specific errors:

```ts
export class DecodeError extends Error {
  readonly issue: DecodeIssue;
}

export class InvalidSchemaError extends Error {}
export class InvalidRouteSchemaError extends Error {}
export class JsonSchemaConversionError extends Error {}
```

Error messages must say:

- what failed,
- which class/field/rule was involved,
- how to fix it.

Examples:

- `InvalidRouteSchemaError: UserUploadRequest.body uses @RawBody, but avatar also uses @IsFile. A request schema can have either one raw body field or multipart fields, not both.`
- `JsonSchemaConversionError: IsCompressed.fromJsonSchema threw while reading property "payload". Fix the decorator's fromJsonSchema implementation or pass { onFactoryError: "skip" } for compatibility mode.`

## 8. Compatibility Plan

V2 should be implemented in four passes.

### Pass 1: Documentation And Type Aliases

- Add this document.
- Add aliases without changing behavior:
  - `RuleOptions = ValidateOptions`
  - `FieldRule = FieldSchemaDecoratorMetadata`
  - `FieldRuleFactory = FieldSchemaDecoratorFactory`
  - `FieldRuleInput`
  - `JsonSchemaInput`
- Add `describeSchema()` while keeping `getSchema()`.
- Add `parse()` and `DecodeError`.

### Pass 2: Normalize Introspection

- Make JSON Schema, OpenAPI, decode, and reshape consume `describeSchema()`.
- Keep existing `Metadata.lookupField(FieldSchema, cls)` behavior under the hood.
- Centralize required-field computation.

### Pass 3: Route Validation

- Add explicit route-schema validation for impossible combinations:
  - multiple `RawBody` fields,
  - `RawBody` plus `IsFile`,
  - duplicate source names in query/header/body placement,
  - `RawBody` on no-body methods unless explicitly allowed.
- OpenAPI generation should call this validation before producing specs.

### Pass 4: Encode/JSON Output

- Implement `toJson()` and make `jsonReplacer()` delegate where possible.
- Use field `encode` hooks.
- Preserve the same field selection rules as decode: decorated fields only.

## 9. Non-Goals

- No `reflect-metadata`.
- No parameter decorators.
- No Zod-like builder-first API.
- No runtime dependency on `@kavri/container`.
- No transport runtime in `@kavri/schema`; web packages consume route/WebSocket metadata.
- No hidden validation of undecorated class fields.

## 10. Root Export Recommendation

The root package should export the everyday API:

```ts
export * from './schema.js';
export * from './field.js';
export * from './decode.js';
export * from './jsonschema.js';
export * from './openapi.js';
export * from './route.js';
export * from './websocket.js';
export * from './reshape.js';
export * from './decorators/index.js';
```

Compatibility note:

- The current root export repeats `route.js` and does not export decorators or reshape helpers.
  V2 should fix that as a public API decision. If this is too broad for the first release, expose
  decorators through `@kavri/schema/decorators` subpath exports instead.

## 11. Final Shape

The best v2 API is not a rewrite. It is the current implementation with sharper public names,
centralized schema introspection, a high-level throwing parse API, explicit route-schema errors, and
documented advanced extension points.

The compatibility surface should remain:

- current decorators,
- current route builders,
- current WebSocket helpers,
- current `decode()` result style,
- current JSON Schema round-trip shape,
- current reshape helpers.

The new preferred surface should add:

- `describeSchema()`,
- `parse()`,
- `DecodeError`,
- `FieldRuleInput`,
- `JsonSchemaInput`,
- `RequiredFields` as a clearer reshape alias,
- explicit invalid schema/route/conversion errors.


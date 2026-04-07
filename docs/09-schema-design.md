# Schema Module Design

Package: `@kavri/schema` — depends on `@kavri/basic` only.

## 1. Principles

- **Class-based schemas.** Define schemas with classes and decorators. No `z.object()`, no `z.infer<>`.
- **No reflect-metadata.** Uses `@kavri/basic` metadata system (`FieldDecorator`, `createFieldDecorator`).
- **Full JSON Schema 2020-12 coverage.** All standard keywords. No non-standard extensions.
- **Full validator.js coverage.** All validators available as decorator factories.
- **Required by default.** Fields are required unless `{ optional: true }` or `{ nullable: true }`. Prefer `nullable`.
- **Minimal.** Field-level only. No structural transforms.
- **Bidirectional.** Class → JSON Schema. JSON Schema → class. Parse and validate.
- **Messages + Routes.** `@Schema` defines messages. `defineRoute` defines HTTP routes. Both shareable.

## 2. Schema Field Decorator System

### Core types

```ts
interface JsonSchema {
    title?: string;
    description?: string;
    type?: string;
    format?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    enum?: unknown[];
    // ... all JSON Schema 2020-12 keywords
}

interface ValidateOptions {
    title?: string;
    message?: string;  // template: '.label must be at least .value characters'
}

interface ValidateSchema<T> extends ValidateOptions {
    value: T;
}

/** Shorthand: pass raw value or { value, title?, message? } */
type ValidateField<T> = T | ValidateSchema<T>;
```

### BaseSchema

All field schemas extend `BaseSchema`:

```ts
interface BaseSchema<S = any, V = S> extends ValidateOptions {
    type?: string;
    description?: string;
    default?: V;
    examples?: V[];
    deprecated?: boolean;
    readOnly?: boolean;
    writeOnly?: boolean;
    optional?: boolean;
    nullable?: boolean;
    const?: ValidateField<V>;
    enum?: ValidateField<V[]>;
    /** Additional inline decorators to compose. */
    decorators?: SchemaFieldDecorator[];
}
```

### SchemaFieldDecorator

A `SchemaFieldDecorator` is a `FieldDecorator` carrying schema metadata. Created by `SchemaField()`.

```ts
type SchemaFieldDecorator<P = any> = FieldDecorator<SchemaFieldDecoratorMetadata<P>>;

interface SchemaFieldDecoratorMetadata<P> {
    factory: SchemaFieldDecoratorFactory<P>;
    params: P;
    decorators: SchemaFieldDecorator[];  // composed child decorators
}
```

### SchemaFieldDecoratorFactory

Every decorator factory (`IsString`, `IsEmail`, `MinLength`, etc.) carries static methods for validation, parsing, serialization, and JSON Schema generation:

```ts
interface SchemaFieldDecoratorFactoryStatic<P> {
    message?: string;
    parse?: (params: P, plain: any) => any;
    serialize?: (params: P, value: any) => any;
    validate?: (params: P, value: any) => boolean;
    toJsonSchema?: (params: P) => JsonSchema;
}

type SchemaFieldDecoratorFactory<P> =
    FieldDecoratorFactory<SchemaFieldDecoratorMetadata<P>>
    & SchemaFieldDecoratorFactoryStatic<P>;
```

### Creating field decorator factories

```ts
declare function createSchemaFieldDecoratorFactory<P extends ValidateOptions>(
    factory: FieldDecoratorFactory<SchemaFieldDecoratorMetadata<P>>,
    statics: SchemaFieldDecoratorFactoryStatic<P>,
): SchemaFieldDecoratorFactory<P>;

declare function SchemaField<P extends ValidateOptions>(
    factory: SchemaFieldDecoratorFactory<P>,
    params: P,
    decorators?: SchemaFieldDecorator[],
): SchemaFieldDecorator<P>;
```

### Example: building a custom decorator

```ts
const MinLength = createSchemaFieldDecoratorFactory(
    function (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> {
        return SchemaField(MinLength, toValidateSchema(options));
    },
    {
        message: '.label must be at least .value characters',
        validate: (params, value) => typeof value !== 'string' || value.length >= params.value,
        toJsonSchema: params => ({ minLength: params.value }),
    },
);
```

## 3. Built-in Field Decorators

### String

```ts
interface StringSchema<V = string> extends BaseSchema<string, V> {
    maxLength?: ValidateField<number>;
    minLength?: ValidateField<number>;
    pattern?: ValidateField<string>;
    format?: string;
}

declare function IsString<V = string>(schema?: StringSchema<V>): SchemaFieldDecorator<StringSchema<V>>;
```

`IsString({ minLength: 3 })` internally pushes `MinLength(3)` into the decorator chain. All inline validation fields become child decorators.

### Numeric

```ts
interface NumericSchema<V = number> extends BaseSchema<number, V> {
    maximum?: ValidateField<V>;
    minimum?: ValidateField<V>;
    exclusiveMaximum?: ValidateField<V>;
    exclusiveMinimum?: ValidateField<V>;
    multipleOf?: ValidateField<V>;
}

declare function IsInteger(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema>;
declare function IsNumber(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema>;
declare function IsBigInt(schema?: NumericSchema<bigint>): SchemaFieldDecorator<NumericSchema<bigint>>;
```

`IsBigInt` → JSON Schema: `{ type: 'string', pattern: '^-?\\d+$' }`. Parsed from string, serialized to string.

### Boolean

```ts
declare function IsBoolean(schema?: BaseSchema<boolean>): SchemaFieldDecorator<BaseSchema<boolean>>;
```

### Date

```ts
interface DateOptions extends ValidateOptions {
    format?: 'iso' | 'date';
    before?: Date;
    after?: Date;
}

declare function IsDate(options?: DateOptions, schema?: StringSchema<Date>): SchemaFieldDecorator<DateOptions>;
```

Composes `IsString` internally. Parse: `new Date(value)`. Serialize: `.toISOString()`. JSON Schema: `{ type: 'string', format: 'date-time' | 'date' }`.

### String format decorators (validator.js)

Each composes `IsString` and adds a `validate` function from `validator`:

```ts
declare function IsEmail(options?: EmailOptions, schema?: StringSchema): SchemaFieldDecorator<EmailOptions>;
declare function IsUrl(options?: ValidateOptions, schema?: StringSchema): SchemaFieldDecorator;
declare function IsUUID(options?: { version?: 3 | 4 | 5 } & ValidateOptions): SchemaFieldDecorator;
declare function IsIP(options?: { version?: 4 | 6 } & ValidateOptions): SchemaFieldDecorator;
// ... all other validator.js validators follow the same pattern
```

### Enum / Const / In

```ts
declare function IsEnum<K extends string, V extends string | number, E extends Record<K, V>>(
    host: ValidateField<E>,
    schema?: InferredSchema<V>,
): SchemaFieldDecorator<ValidateSchema<E>>;

declare function IsIn<V extends readonly (string | number)[]>(
    values: ValidateField<V>,
    schema?: InferredSchema<V[number]>,
): SchemaFieldDecorator<ValidateSchema<V>>;

declare function IsConst<V>(
    value: ValidateField<V>,
    schema?: InferredSchema<V>,
): SchemaFieldDecorator<ValidateSchema<V>>;
```

`InferredSchema<V>` resolves to `NumericSchema` for numbers, `StringSchema` for strings, `ObjectSchema` for objects.

### Composite types

```ts
// Object with properties
interface ObjectSchema<T = object> extends BaseSchema<T> {
    properties?: { [K in keyof T]?: SchemaFieldDecorator };
    patternProperties?: Record<string, SchemaFieldDecorator>;
    additionalProperties?: SchemaFieldDecorator;
    propertyNames?: SchemaFieldDecorator;
    maxProperties?: ValidateField<number>;
    minProperties?: ValidateField<number>;
    required?: ValidateField<Array<keyof T>>;
}

declare function IsObject<T extends object>(
    properties: { [K in keyof T]?: SchemaFieldDecorator },
    schema?: ObjectSchema<T>,
): SchemaFieldDecorator<ObjectSchema<T>>;

// Record<string, V>
declare function IsRecord<V>(
    value: SchemaFieldDecorator,
    schema?: ObjectSchema<Record<string, V>>,
): SchemaFieldDecorator<ObjectSchema<Record<string, V>>>;

// Array
interface ArraySchema<T = any> extends BaseSchema<T[]> {
    items?: SchemaFieldDecorator;
    minItems?: ValidateField<number>;
    maxItems?: ValidateField<number>;
    uniqueItems?: ValidateField<boolean>;
}

declare function IsArray<T>(
    items: SchemaFieldDecorator,
    schema?: ArraySchema<T>,
): SchemaFieldDecorator<ArraySchema<T>>;

// Reference to @Schema class (always lazy)
declare function Ref<T extends object>(
    ref: ValidateField<() => AnyConstructor<T>>,
    schema?: ObjectSchema<T>,
): SchemaFieldDecorator<ValidateSchema<() => AnyConstructor<T>>>;

// Union
interface AnyOfSchema<T = any> extends BaseSchema<T> {
    anyOf: SchemaFieldDecorator[];
}

declare function AnyOf<T>(
    anyOf: SchemaFieldDecorator[],
    schema?: BaseSchema<T>,
): SchemaFieldDecorator<AnyOfSchema<T>>;
```

## 4. @Schema Decorator

```ts
declare function Schema<T>(schema?: ObjectSchema<T>): ClassDecorator<ObjectSchema<T>>;
```

`@Schema()` aggregates all field decorator metadata from the class. If `schema.properties` is provided inline, those definitions are used directly.

Fields without decorators are ignored — not parsed, validated, or serialized.

## 5. Utilities

```ts
/** Get schema metadata from a @Schema class. */
declare function getSchema(clazz: AnyConstructor<any>): ObjectSchema<any>;

/** Generate JSON Schema 2020-12 from a @Schema class. */
declare function toJsonSchema(clazz: AnyConstructor<any>): object;

/** Reverse-engineer JSON Schema into inline field decorators. */
declare function fromJsonSchema(jsonSchema: object): Record<string, SchemaFieldDecorator>;

/** Programmatically register schema on a class. */
declare function defineSchema(clazz: AnyConstructor<any>, schema: ObjectSchema<any>): void;

/** Parse raw data into a @Schema class instance. Validates and applies parsers. */
declare function parse<T>(clazz: AnyConstructor<T>, data: unknown): T;

/** Validate without creating instance. Returns null if valid. */
declare function validate(clazz: AnyConstructor<any>, data: unknown): SchemaValidationError | null;

/** Serialize instance to plain object. Applies serializers, excludes @Ignore fields. */
declare function serialize<T>(instance: T): object;

/** Convert ValidateField<T> to ValidateSchema<T>. */
declare function toValidateSchema<T>(options: ValidateField<T>): ValidateSchema<T>;
```

## 6. Error Types

```ts
declare class SchemaValidationError extends Error {
    readonly clazz: AnyConstructor<any>;
    readonly issues: ValidationIssue[];
}

interface ValidationIssue {
    path: string[];
    message: string;
    rule: string;
    expected?: unknown;
    received?: unknown;
}
```

## 7. Route Definitions

Like protobuf: `@Schema` classes are messages, `defineRoute` defines HTTP endpoints. Both shareable between frontend and backend.

### Core types

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

/** Request/response type markers. */
type RequestInput<T> = AnyConstructor<T> | 'void';
type ResponseOutput<T> = AnyConstructor<T> | 'void' | 'stream';

interface EndpointOptions {
    path?: string;
    /** HTTP method semantics. */
    idempotency?: 'safe' | 'idempotent' | 'volatile';
    /** Request body encoding. Default: 'data'. */
    requestType?: 'data' | 'multipart' | 'binary';
    /** Required when requestType = 'multipart'. */
    multipart?: { maxFileSize: number; maxBodySize: number };
    /** Required when requestType = 'binary'. */
    binary?: { maxBodySize: number };
}

interface Endpoint<TReq = any, TRes = any> {
    method: HttpMethod;
    path: string;
    request: RequestInput<TReq>;
    response: ResponseOutput<TRes>;
    options: EndpointOptions;
}
```

- `'void'` — no request/response body.
- `'stream'` — response is a binary stream (only for response, not request).
- `'data'` — structured body (JSON, form-data, etc.). Default for `requestType`.
- `'multipart'` — multipart/form-data. Use `@IsFile()` fields in the request schema.
- `'binary'` — raw binary body. Use `@IsBody()` field in the request schema.

### Route-specific field decorators

These decorators are exclusive to route request schemas. They auto-set the field's schema — do NOT compose with other schema decorators (`@IsString`, `@IsInteger`, etc.).

```ts
/** Represents an uploaded file in a multipart request. */
interface MultipartFile {
    /** Original uploaded filename. */
    readonly name: string;
    /** Temp file path on disk. */
    readonly path: string;
}

/**
 * Marks a field as a file upload. Use in multipart request schemas only.
 * Auto-sets schema to MultipartFile (or MultipartFile[] if isArray=true).
 * Do NOT wrap with @IsArray(IsFile()) — use @IsFile(true) instead.
 * Do NOT combine with other schema decorators.
 */
declare function IsFile(isArray?: boolean, options?: ValidateOptions): SchemaFieldDecorator;
// @IsFile()     → field type: MultipartFile
// @IsFile(true) → field type: MultipartFile[]

/**
 * Marks a field as the raw binary request body stream.
 * Use in binary request schemas only. At most one @IsBody per schema.
 * Auto-sets schema to ReadableStream.
 * Do NOT combine with other schema decorators.
 */
declare function IsBody(options?: ValidateOptions): SchemaFieldDecorator;

```

Usage:

```ts
// Multipart upload — single file
@Schema()
class AvatarUpload {
    @IsString() description!: string;
    @IsFile() avatar!: MultipartFile;
}

// Multipart upload — multiple files
@Schema()
class BulkUpload {
    @IsString() batchId!: string;
    @IsFile(true) files!: MultipartFile[];
}

// Binary body
@Schema()
class RawUploadParams {
    @IsInteger() id!: number;      // from path/query
    @IsBody() body!: ReadableStream;
}

```

### HTTP method helpers

All helpers share the signature: `method(request, response, pathOrOptions?, options?)`.

- `request` and `response` are **required**. Use `'void'` or `'stream'` for non-structured.
- `path` is optional. If omitted, the method name is used as the path (e.g., `getUser` → `/getUser`).
- `options` for advanced settings (idempotency, requestType, multipart/binary limits).

```ts
declare function get<TReq, TRes>(
    request: RequestInput<TReq>,
    response: ResponseOutput<TRes>,
    pathOrOptions?: string | EndpointOptions,
    options?: EndpointOptions,
): Endpoint<TReq, TRes>;

declare function post<TReq, TRes>(request: RequestInput<TReq>, response: ResponseOutput<TRes>, pathOrOptions?: string | EndpointOptions, options?: EndpointOptions): Endpoint<TReq, TRes>;
declare function put<TReq, TRes>(request: RequestInput<TReq>, response: ResponseOutput<TRes>, pathOrOptions?: string | EndpointOptions, options?: EndpointOptions): Endpoint<TReq, TRes>;
declare function del<TReq, TRes>(request: RequestInput<TReq>, response: ResponseOutput<TRes>, pathOrOptions?: string | EndpointOptions, options?: EndpointOptions): Endpoint<TReq, TRes>;
declare function patch<TReq, TRes>(request: RequestInput<TReq>, response: ResponseOutput<TRes>, pathOrOptions?: string | EndpointOptions, options?: EndpointOptions): Endpoint<TReq, TRes>;
declare function head<TReq, TRes>(request: RequestInput<TReq>, response: ResponseOutput<TRes>, pathOrOptions?: string | EndpointOptions, options?: EndpointOptions): Endpoint<TReq, TRes>;
```

### defineRoute

```ts
declare function defineRoute<T extends Record<string, Endpoint>>(
    name: string,
    basePath: string,
    endpoints: T,
): RouteDefinition<T>;

interface RouteDefinition<T extends Record<string, Endpoint>> {
    readonly name: string;
    readonly basePath: string;
    readonly endpoints: T;
}
```

### OpenAPI generation

```ts
declare function generateOpenAPI(route: RouteDefinition<any>, options: { title: string; version: string }): object;
```

### Examples

```ts
// --- Normal JSON endpoints ---

const UserRoute = defineRoute('UserRoute', '/user', {
    getUser: get(GetUserParams, UserResponse, '/:id'),
    createUser: post(CreateUserBody, UserResponse),     // path = /createUser
    deleteUser: del(GetUserParams, 'void', '/:id'),
});

// --- File upload (multipart) ---

@Schema()
class AvatarUpload {
    @IsString() description!: string;
    @IsFile() avatar!: MultipartFile;
}

@Schema()
class BulkUpload {
    @IsString() batchId!: string;
    @IsFile(true) files!: MultipartFile[];
}

const FileRoute = defineRoute('FileRoute', '/file', {
    uploadAvatar: post(AvatarUpload, AvatarResponse, '/avatar', {
        requestType: 'multipart',
        multipart: { maxFileSize: 5_000_000, maxBodySize: 10_000_000 },
    }),
    bulkUpload: post(BulkUpload, BulkResponse, '/bulk', {
        requestType: 'multipart',
        multipart: { maxFileSize: 10_000_000, maxBodySize: 50_000_000 },
    }),
});

// --- Binary upload (raw body) ---

@Schema()
class RawUploadParams {
    @IsInteger() id!: number;
    @IsBody() body!: ReadableStream;
}

const RawRoute = defineRoute('RawRoute', '/raw', {
    putFile: put(RawUploadParams, 'void', '/:id', {
        requestType: 'binary',
        binary: { maxBodySize: 100_000_000 },
    }),
});

// --- File download (stream response) ---

const DownloadRoute = defineRoute('DownloadRoute', '/download', {
    downloadFile: get(DownloadParams, 'stream', '/:id'),
    healthCheck: get('void', 'void', '/health'),
});

// Client types:
// client.uploadAvatar({ description: '...', avatar: file })  → Promise<AvatarResponse>
// client.putFile({ id: 1, body: stream })                     → Promise<void>
// client.downloadFile({ id: 1 })                              → Promise<ReadableStream>
// client.healthCheck()                                        → Promise<void>
```

## 8. Required vs Optional vs Nullable

| Declaration | JSON Schema | Parse behavior |
|---|---|---|
| `@IsString()` | `required`, `type: 'string'` | Missing → error. `null` → error. |
| `@IsString({ optional: true })` | Not in `required` | Missing → omitted. `null` → error. |
| `@IsString({ nullable: true })` | `required`, `type: ['string', 'null']` | Missing → error. `null` → ok. |
| `@IsString({ optional: true, nullable: true })` | Not in `required`, `type: ['string', 'null']` | Missing → omitted. `null` → ok. |

## 9. Full Example

```ts
import {
    Schema, IsString, IsInteger, IsBigInt, IsEmail, IsDate,
    IsEnum, IsArray, IsBoolean, IsRecord, Ref, AnyOf,
    parse, validate, serialize, toJsonSchema, defineRoute, get, post, del,
} from '@kavri/schema';

enum Gender {
    Male = 1,
    Female = 2,
}

@Schema({ description: 'User model' })
class User {
    @IsInteger({ minimum: 1 })
    id!: number;

    @IsString({ minLength: 1, maxLength: 100 })
    name!: string;

    @IsEnum(Gender, { nullable: true })
    gender!: Gender | null;

    @IsEmail()
    email!: string;

    @IsArray(Ref(() => Post), { optional: true })
    posts?: Post[];
}

@Schema()
class Post {
    @IsBigInt({ minimum: 1n })
    id!: bigint;

    @IsString({ minLength: 1, maxLength: 100 })
    title!: string;

    @IsString({ minLength: 1, maxLength: 10000 })
    content!: string;

    @IsInteger()
    authorId!: number;

    @Ref(() => User, { optional: true })
    author?: User;

    @IsDate()
    createdAt!: Date;

    @IsDate()
    updatedAt!: Date;
}

// Parse
const user = parse(User, {
    id: 1,
    name: 'alice',
    gender: 1,
    email: 'alice@example.com',
});

// Generate JSON Schema
const jsonSchema = toJsonSchema(User);

// Define route
const UserRoute = defineRoute('UserRoute', '/user', {
    getUser: get(GetUserParams, User, '/:id'),
    createUser: post(CreateUserBody, User),
    deleteUser: del(GetUserParams, 'void', '/:id'),
});
```

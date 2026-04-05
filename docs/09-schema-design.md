# Schema Module Design

Package: `@kavri/schema` — no dependency on `@kavri/core`.

## 1. Principles

- **Class-based schemas.** Define schemas with classes and decorators. No `z.object()`, no `z.infer<>`.
- **No reflect-metadata.** Decorators work with both TC39 and TypeScript experimental decorators, using `@kavri/basic` metadata system.
- **Full JSON Schema coverage.** All rules from the latest JSON Schema standard (2020-12). No non-standard extensions.
- **Full validator.js coverage.** All validators from the `validator` npm package available as decorators.
- **Strict mode only.** If a class is `@Schema`, every field must have a decorator or `@Ignore`. Configurable via `checkAllFields`.
- **Required by default.** Fields are required unless explicitly `{ optional: true }` or `{ nullable: true }`. Prefer `nullable` over `optional`.
- **Minimal.** Field-level only. No structural transforms (no `_id` → `id` mapping).
- **Bidirectional.** Class → JSON Schema. JSON Schema → class schema definition. Parse (deserialize) and validate.

## 2. Module Imports

```
@kavri/basic   → Metadata, createClassDecorator, createFieldDecorator, etc.
@kavri/schema  → Schema, field decorators, parse, validate, toJsonSchema, fromJsonSchema
@kavri/core    → Component, Container, inject, etc. (depends on @kavri/basic)
@kavri/event   → EventType, EventBus, etc. (depends on @kavri/core)
@kavri/config  → createConfiguration, Loader, Resolver, etc. (depends on @kavri/core)
@kavri/web     → Controller, Interceptor, WebApplication, etc. (depends on @kavri/core, @kavri/config)
```

`@kavri/schema` depends only on `@kavri/basic`. It can be used standalone without the IoC container.

## 3. Field Decorator System

### FieldDecorator type

A `FieldDecorator` is a property/field decorator that carries JSON Schema metadata. All field decorators produce `FieldDecorator` values.

```ts
interface FieldSchema {
    // JSON Schema 2020-12 fields
    type?: string | string[];
    format?: string;
    enum?: unknown[];
    const?: unknown;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minProperties?: number;
    maxProperties?: number;
    required?: string[];
    properties?: Record<string, FieldSchema>;
    additionalProperties?: boolean | FieldSchema;
    items?: FieldSchema;
    prefixItems?: FieldSchema[];
    oneOf?: FieldSchema[];
    anyOf?: FieldSchema[];
    allOf?: FieldSchema[];
    not?: FieldSchema;
    if?: FieldSchema;
    then?: FieldSchema;
    else?: FieldSchema;
    $ref?: string;
    description?: string;
    default?: unknown;
    examples?: unknown[];
    deprecated?: boolean;
    readOnly?: boolean;
    writeOnly?: boolean;
    title?: string;
    // ... all other JSON Schema 2020-12 keywords

    // Kavri extensions (stripped when generating JSON Schema)
    optional?: boolean;     // field is optional (not in required[])
    nullable?: boolean;     // adds null to type union
    validator?: string;     // validator.js function name for runtime validation
    validatorArgs?: unknown[]; // args for validator.js function
    parse?: (raw: unknown) => unknown;  // custom parse (e.g., Date from string)
    class?: AnyConstructor<any>;        // nested @Schema class reference
    lazyClass?: () => AnyConstructor<any>; // lazy reference for circular deps
}

type FieldDecorator = PropertyDecorator & { readonly __schema: FieldSchema };
```

Every field decorator is both a property decorator AND carries its schema as `__schema`. This allows field decorators to be used both as decorators and as inline schema values (in `@Schema({ schema: { ... } })` and `@IsArray(IsInteger())`).

### createFieldDecorator — base factory

All field decorators are built from this:

```ts
declare function createFieldDecorator(schema: FieldSchema): FieldDecorator;
```

Example: `IsEmail` is just:

```ts
function IsEmail(options?: { nullable?: boolean; optional?: boolean; description?: string }): FieldDecorator {
    return createFieldDecorator({
        type: 'string',
        format: 'email',
        validator: 'isEmail',
        ...options,
    });
}
```

All built-in decorators follow this pattern. Users can create custom ones the same way.

## 4. Built-in Field Decorators

### Primitive types

```ts
// String
declare function IsString(options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    enum?: string[];          // JSON Schema enum
    in?: string[];            // alias for enum
    nullable?: boolean;
    optional?: boolean;
    default?: string;
    description?: string;
}): FieldDecorator;

// Number (float)
declare function IsNumber(options?: {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    enum?: number[];
    in?: number[];
    nullable?: boolean;
    optional?: boolean;
    default?: number;
    description?: string;
}): FieldDecorator;

// Integer
declare function IsInteger(options?: {
    // same as IsNumber
    minimum?: number;
    maximum?: number;
    min?: number;             // alias for minimum
    max?: number;             // alias for maximum
    enum?: number[];
    in?: number[];
    nullable?: boolean;
    optional?: boolean;
    default?: number;
    description?: string;
}): FieldDecorator;

// Boolean
declare function IsBoolean(options?: {
    nullable?: boolean;
    optional?: boolean;
    default?: boolean;
    description?: string;
}): FieldDecorator;
```

### String format decorators (validator.js based)

Each maps to a JSON Schema `format` and a `validator.js` function for runtime validation:

```ts
declare function IsEmail(options?: FieldDecoratorOptions): FieldDecorator;         // format: 'email'
declare function IsUrl(options?: FieldDecoratorOptions): FieldDecorator;           // format: 'uri'
declare function IsUUID(options?: { version?: 3 | 4 | 5 } & FieldDecoratorOptions): FieldDecorator;  // format: 'uuid'
declare function IsIP(options?: { version?: 4 | 6 } & FieldDecoratorOptions): FieldDecorator;
declare function IsISO8601(options?: FieldDecoratorOptions): FieldDecorator;       // format: 'date-time'
declare function IsCreditCard(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsHexColor(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsJSON(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsJWT(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsBase64(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsMimeType(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsSlug(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsAlpha(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsAlphanumeric(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsNumericString(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsPhoneNumber(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsPostalCode(options?: { locale?: string } & FieldDecoratorOptions): FieldDecorator;
declare function IsCurrency(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsDataURI(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsMACAddress(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsISBN(options?: { version?: 10 | 13 } & FieldDecoratorOptions): FieldDecorator;
declare function IsISSN(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsFQDN(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsSemVer(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsHash(options?: { algorithm: string } & FieldDecoratorOptions): FieldDecorator;
declare function IsHexadecimal(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsMongoId(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsLocale(options?: FieldDecoratorOptions): FieldDecorator;
declare function IsLatLong(options?: FieldDecoratorOptions): FieldDecorator;
// ... all other validator.js validators follow the same pattern
```

Common options type:

```ts
interface FieldDecoratorOptions {
    nullable?: boolean;
    optional?: boolean;
    description?: string;
    default?: unknown;
    deprecated?: boolean;
}
```

### Built-in object types

```ts
// Date — parses from ISO 8601 string, serializes to ISO string
declare function IsDate(options?: FieldDecoratorOptions): FieldDecorator;
// JSON Schema: { type: 'string', format: 'date-time' }
// Parse: new Date(value)
// Serialize: value.toISOString()

// Numeric enum
declare function IsEnum<T extends Record<string, number>>(
    enumObj: T,
    options?: FieldDecoratorOptions,
): FieldDecorator;
// JSON Schema: { type: 'integer', enum: [0, 1, 2, ...] }
```

### Composite types

```ts
// Array of a specific type
declare function IsArray(
    items: FieldDecorator | AnyConstructor<any>,
    options?: {
        minItems?: number;
        maxItems?: number;
        uniqueItems?: boolean;
        nullable?: boolean;
        optional?: boolean;
        description?: string;
    },
): FieldDecorator;

// Nested @Schema class reference
declare function Ref(
    clazz: AnyConstructor<any>,
    options?: FieldDecoratorOptions,
): FieldDecorator;

// Lazy reference for circular dependencies
declare function LazyRef(
    factory: () => AnyConstructor<any>,
    options?: FieldDecoratorOptions,
): FieldDecorator;

// Inline object (not a @Schema class)
declare function IsObject(
    properties: Record<string, FieldDecorator>,
    options?: {
        additionalProperties?: boolean;
        nullable?: boolean;
        optional?: boolean;
        description?: string;
    },
): FieldDecorator;

// Union types
declare function OneOf(
    schemas: FieldDecorator[],
    options?: FieldDecoratorOptions,
): FieldDecorator;

declare function AnyOf(
    schemas: FieldDecorator[],
    options?: FieldDecoratorOptions,
): FieldDecorator;

// Constant value
declare function IsConst(
    value: unknown,
    options?: FieldDecoratorOptions,
): FieldDecorator;

// Any / unknown — no validation
declare function IsAny(options?: FieldDecoratorOptions): FieldDecorator;

// Map / Record<string, T>
declare function IsRecord(
    values: FieldDecorator | AnyConstructor<any>,
    options?: {
        minProperties?: number;
        maxProperties?: number;
        nullable?: boolean;
        optional?: boolean;
        description?: string;
    },
): FieldDecorator;

// Tuple
declare function IsTuple(
    items: FieldDecorator[],
    options?: FieldDecoratorOptions,
): FieldDecorator;
```

## 5. @Schema Decorator

```ts
interface SchemaOptions {
    /** JSON Schema description. */
    description?: string;
    /** JSON Schema title. */
    title?: string;
    /**
     * Inline schema definitions for all fields.
     * Alternative to using field decorators on each property.
     */
    schema?: Record<string, FieldDecorator>;
    /**
     * If true, verifies every class field has a schema decorator or @Ignore.
     * Depends on useDefineForClassFields compiler option.
     * Default: false.
     */
    checkAllFields?: boolean;
}

interface SchemaMetadata {
    options: SchemaOptions;
    fields: Record<string, FieldSchema>;
}

declare function Schema(options?: SchemaOptions): ClassDecorator<SchemaMetadata>;
```

`@Schema` aggregates all field decorator metadata from the class into a single `fields` map. If `options.schema` is provided, those inline definitions are used (field decorators on properties are not needed).

### @Ignore

```ts
declare function Ignore(): FieldDecorator;
```

Marks a field as ignored. The field is excluded from parse, validate, and serialize. At runtime, the property is made non-enumerable on parsed instances.

## 6. Utilities

### getSchema — read schema from class

```ts
declare function getSchema(clazz: AnyConstructor<any>): SchemaMetadata;
```

Returns the aggregated schema metadata from `@Schema`. Throws if the class is not decorated with `@Schema`.

### toJsonSchema — generate JSON Schema

```ts
declare function toJsonSchema(clazz: AnyConstructor<any>): object;
```

Generates a JSON Schema 2020-12 document from a `@Schema`-decorated class. Handles `Ref`, `LazyRef` as `$ref`. Strips Kavri-specific extensions (`validator`, `parse`, `class`, `lazyClass`).

### fromJsonSchema — JSON Schema to inline schema definition

```ts
declare function fromJsonSchema(jsonSchema: object): Record<string, FieldDecorator>;
```

Reverse-engineers a JSON Schema into a field decorator map. Use with `@Schema({ schema: fromJsonSchema(existingSchema) })`.

### defineSchema — register schema on an existing class

```ts
declare function defineSchema(clazz: AnyConstructor<any>, options: SchemaOptions): void;
```

Programmatically attaches `@Schema` metadata to a class. Equivalent to `Metadata.apply(Schema, clazz, ...)`.

### parse — deserialize and validate

```ts
declare function parse<T>(clazz: AnyConstructor<T>, data: unknown): T;
```

1. Validates `data` against the class schema.
2. Creates an instance of `clazz`.
3. Assigns validated fields to the instance.
4. Applies custom parsers (e.g., `IsDate` → `new Date()`).
5. Makes `@Ignore`-d fields non-enumerable.
6. Returns the typed instance.

Throws `SchemaValidationError` on validation failure.

### validate — validate without parsing

```ts
declare function validate(clazz: AnyConstructor<any>, data: unknown): SchemaValidationError | null;
```

Validates `data` against the class schema without creating an instance. Returns null if valid, `SchemaValidationError` if invalid.

### serialize — instance to plain object

```ts
declare function serialize<T>(instance: T): object;
```

Converts a class instance to a plain object. Applies serializers (e.g., `Date` → ISO string). Excludes `@Ignore`-d fields (non-enumerable).

## 7. Error Types

```ts
declare class SchemaValidationError extends Error {
    readonly clazz: AnyConstructor<any>;
    readonly issues: ValidationIssue[];
}

interface ValidationIssue {
    path: string[];       // e.g., ['posts', '0', 'title']
    message: string;
    rule: string;          // e.g., 'minLength', 'isEmail', 'required'
    expected?: unknown;
    received?: unknown;
}
```

## 8. ConfigParser compatibility

`@Schema` classes satisfy the `ConfigParser<T>` interface used by `@kavri/config`:

```ts
// ConfigParser<T> = { parse(raw: unknown): T }
// A @Schema class can be used as:
const UserConfig = createConfiguration('user', schemaParser(UserConfigClass));
```

Helper:

```ts
declare function schemaParser<T>(clazz: AnyConstructor<T>): ConfigParser<T>;
```

## 9. Full Example

```ts
import {
    Schema, Ignore,
    IsString, IsInteger, IsNumber, IsBoolean,
    IsEmail, IsDate, IsEnum, IsUUID,
    IsArray, IsObject, IsRecord,
    Ref, LazyRef, OneOf, IsConst, IsAny,
    parse, validate, serialize, toJsonSchema, fromJsonSchema, getSchema, defineSchema,
    createFieldDecorator,
} from '@kavri/schema';

// --- Numeric enum ---

enum Role {
    Admin = 0,
    User = 1,
    Guest = 2,
}

// --- Schemas ---

@Schema({ description: 'User model' })
class User {
    @IsInteger({ min: 1, description: 'User ID' })
    id!: number;

    @IsString({ minLength: 3, maxLength: 30 })
    nickname!: string;

    @IsEmail()
    email!: string;

    @IsDate({ nullable: true })
    birthday!: Date | null;

    @IsEnum(Role)
    role!: Role;

    @OneOf([IsInteger({ in: [1, 2, 3] }), IsString({ in: ['A', 'B'] })])
    demoFlag!: 1 | 2 | 3 | 'A' | 'B';

    @IsObject({ id: IsInteger() }, { additionalProperties: true })
    metadata!: { id: number; [key: string]: any };

    @IsArray(Ref(Post), { minItems: 0, optional: true })
    posts?: Post[];

    @IsArray(IsInteger())
    tagIds!: number[];

    @IsRecord(IsString())
    labels!: Record<string, string>;

    @Ignore()
    private _cache: any;
}

@Schema()
class Post {
    @IsInteger()
    id!: number;

    @LazyRef(() => User, { description: 'Author', optional: true })
    author?: User;

    @IsString()
    title!: string;

    @IsString()
    content!: string;

    @IsDate()
    createdAt!: Date;
}

// --- Usage ---

// Parse
const user = parse(User, {
    id: 1,
    nickname: 'alice',
    email: 'alice@example.com',
    birthday: '1990-01-01T00:00:00Z',  // parsed to Date
    role: 0,
    demoFlag: 'A',
    metadata: { id: 42, extra: 'value' },
    tagIds: [1, 2, 3],
    labels: { lang: 'en', region: 'us' },
});
// user instanceof User === true
// user.birthday instanceof Date === true

// Validate only
const error = validate(User, { id: 'not a number' });
// error.issues[0]: { path: ['id'], message: '...', rule: 'type' }

// Serialize
const plain = serialize(user);
// { id: 1, nickname: 'alice', ..., birthday: '1990-01-01T00:00:00.000Z' }
// _cache is excluded (non-enumerable)

// Generate JSON Schema
const jsonSchema = toJsonSchema(User);
// Standard JSON Schema 2020-12 document

// From JSON Schema
@Schema({ schema: fromJsonSchema(existingJsonSchemaObject) })
class ExternalModel {}

// Inline schema (no field decorators needed)
@Schema({
    schema: {
        id: IsInteger(),
        name: IsString({ minLength: 1 }),
        email: IsEmail(),
    },
})
class InlineUser {
    id!: number;
    name!: string;
    email!: string;
}

// Programmatic registration
class LegacyModel {
    id!: number;
    name!: string;
}

defineSchema(LegacyModel, {
    schema: {
        id: IsInteger(),
        name: IsString(),
    },
});

// Read schema
const meta = getSchema(User);
// meta.fields.id: { type: 'integer', minimum: 1, description: 'User ID' }

// Custom field decorator
function IsSlackChannel(options?: FieldDecoratorOptions): FieldDecorator {
    return createFieldDecorator({
        type: 'string',
        pattern: '^#[a-z0-9-]+$',
        description: 'Slack channel name',
        validator: 'matches',
        validatorArgs: [/^#[a-z0-9-]+$/],
        ...options,
    });
}

// Use with @kavri/config
import { createConfiguration, schemaParser } from '@kavri/config';

@Schema()
class AppConfig {
    @IsString({ default: 'my-app' })
    name!: string;

    @IsInteger({ default: 3000 })
    port!: number;

    @IsBoolean({ default: false })
    debug!: boolean;
}

const AppConfiguration = createConfiguration('app', schemaParser(AppConfig));
```

## 10. checkAllFields Behavior

When `@Schema({ checkAllFields: true })`:

1. At decoration time, `@Schema` enumerates all own property keys on the class prototype and instance (requires `useDefineForClassFields: true` in tsconfig or explicit initialization).
2. Every property must have either a field decorator or `@Ignore()`.
3. If a property has neither, `@Schema` throws `SchemaDefinitionError` at decoration time.

When `checkAllFields: false` (default):

Fields without decorators are silently ignored — they are not parsed, validated, or serialized. Only decorated fields participate in the schema.

## 11. Required vs Optional vs Nullable

| Declaration | JSON Schema | Parse behavior |
|---|---|---|
| `@IsString()` | `required`, `type: 'string'` | Missing → error. `null` → error. |
| `@IsString({ optional: true })` | Not in `required`, `type: 'string'` | Missing → omitted. `null` → error. |
| `@IsString({ nullable: true })` | `required`, `type: ['string', 'null']` | Missing → error. `null` → ok. |
| `@IsString({ optional: true, nullable: true })` | Not in `required`, `type: ['string', 'null']` | Missing → omitted. `null` → ok. |

Prefer `nullable` over `optional` when the field should always be present but may have no value.

## 12. Circular References

`LazyRef` handles circular dependencies:

```ts
@Schema()
class TreeNode {
    @IsString()
    name!: string;

    @IsArray(LazyRef(() => TreeNode), { optional: true })
    children?: TreeNode[];
}
```

`LazyRef(() => TreeNode)` defers class resolution. In JSON Schema output, it produces a `$ref`. In parse, it resolves the class lazily.

`Ref(Post)` is for non-circular references — the class must already be defined.

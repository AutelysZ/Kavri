/*
 * @since 2026-04-06 15:41:49
 * @author acrazing <joking.young@gmail.com>
 */

import {
    FieldDecoratorFactory,
    FieldDecorator,
    createFieldDecorator,
    AnyConstructor,
    createClassDecorator,
    ClassDecorator,
} from './draft'

interface JsonSchema {
    title?: string;
    description?: string;
    minLength?: number;
    format?: string;
    // ... all json schem fields here
}

interface ValidateOptions {
    title?: string;
    message?: string;
}

interface ValidateSchema<T> extends ValidateOptions {
    value: T;
}

type ValidateField<T> = T | ValidateSchema<T>;

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
    decorators?: SchemaFieldDecorator[];
}

interface StringSchema<V = string> extends BaseSchema<string, V> {
    maxLength?: ValidateField<number>;
    minLength?: ValidateField<number>;
    pattern?: ValidateField<string>;
    format?: string;
}

interface NumericSchema<V = number> extends BaseSchema<number, V> {
    maximum?: ValidateField<V>;
    minimum?: ValidateField<V>;
    // ...
}

interface SchemaFieldDecoratorFactoryStatic<P> {
    message?: string;
    parse?: (params: P, plain: any) => any;
    serialize?: (params: P, value: any) => any;
    validate?: (params: P, value: any) => any;
    toJsonSchema?: (params: P) => JsonSchema;
}

type SchemaFieldDecorator<P = any> = FieldDecorator<SchemaFieldDecoratorMetadata<P>>;

interface SchemaFieldDecoratorMetadata<P> {
    factory: SchemaFieldDecoratorFactory<P>;
    params: P;
    decorators: SchemaFieldDecorator[];
}

type SchemaFieldDecoratorFactory<P> =
    FieldDecoratorFactory<SchemaFieldDecoratorMetadata<P>>
    & SchemaFieldDecoratorFactoryStatic<P>;

function createSchemaFieldDecoratorFactory<P extends ValidateOptions, F extends FieldDecoratorFactory<SchemaFieldDecoratorMetadata<P>>>(factory: F, statics: SchemaFieldDecoratorFactoryStatic<P>): F & SchemaFieldDecoratorFactoryStatic<P> {
    return Object.assign(factory, statics);
}

function SchemaField<P extends ValidateOptions>(factory: SchemaFieldDecoratorFactory<P>, params: P, decorators: SchemaFieldDecorator[] = []): SchemaFieldDecorator<P> {
    return createFieldDecorator<SchemaFieldDecoratorMetadata<P>>(SchemaField, {params, factory, decorators})
}

declare function toValidateSchema<T>(options: ValidateField<T>): ValidateSchema<T>

export const MinLength = createSchemaFieldDecoratorFactory(function (options: ValidateField<number>): SchemaFieldDecorator<ValidateSchema<number>> {
    return SchemaField(MinLength, toValidateSchema(options));
}, {
    // validate should resolve .xxx styled variables in the template
    // .label = .title || .key
    // .key is field name
    message: '.label must be at least .value characters',
    validate: (params, value) => typeof value !== 'string' || value.length >= params.value, // only validate string
    toJsonSchema: params => ({minLength: params.value})
})

export const IsString = createSchemaFieldDecoratorFactory(function <V = string>({
                                                                                    minLength,
                                                                                    maxLength, /* and other validate fields */
                                                                                    decorators = [],
                                                                                    ...schema
                                                                                }: StringSchema<V> = {}): SchemaFieldDecorator<StringSchema<V>> {
    if (minLength) {
        decorators.push(MinLength(minLength));
    }
    // other inline decorators

    return SchemaField<StringSchema<V>>(IsString, schema, decorators);
}, {
    message: '.label must be a string',
    validate: (params, value) => typeof value === 'string',
    toJsonSchema: params => ({
        type: 'string',
        title: params.title,
        // ...
    })
});

type InferredSchema<V> = V extends number ? NumericSchema<V> : V extends string ? StringSchema<V> : ObjectSchema<V> /* and others */

declare function IsEnum<K extends string, V extends string | number, E extends Record<K, V>>(host: ValidateField<E>, schema?: InferredSchema<V>): SchemaFieldDecorator<ValidateSchema<E>>

declare function IsIn<V extends readonly (string | number)[]>(host: ValidateField<V>, schema?: InferredSchema<V>): SchemaFieldDecorator<ValidateSchema<V>>

declare function IsConst<V>(value: ValidateField<V>, schema?: InferredSchema<V>): SchemaFieldDecorator<ValidateSchema<V>>

// isEmail options from validator
declare interface IsEmailOptions {
}

declare function isEmail(email: any, options: IsEmailOptions): boolean;

interface EmailOptions extends IsEmailOptions, ValidateOptions {
}

export const IsEmail = createSchemaFieldDecoratorFactory(function (options: EmailOptions = {}, schema: StringSchema = {}): SchemaFieldDecorator<EmailOptions> {
    return SchemaField(IsEmail, options, [IsString(schema)])
}, {
    validate: (params, value) => isEmail(value, params),
    toJsonSchema: params => ({format: 'email'})
})

interface DateOptions extends ValidateOptions {
    format?: 'iso' | 'date';
    before?: Date;
    after?: Date;
}

export const IsDate = createSchemaFieldDecoratorFactory(function (options: DateOptions = {}, schema?: StringSchema<Date>): SchemaFieldDecorator<DateOptions> {
    return SchemaField<DateOptions>(IsDate, options, [IsString(schema)]);
}, {
    parse: (params, plain) => new Date(plain),
    serialize: (params, value: Date) => value.toISOString(),
    validate: (params, plain) => isFinite(new Date(plain).valueOf()),
    toJsonSchema: params => ({format: params.format === 'iso' ? 'date-time' : 'date'})
});

declare function IsInteger(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema>;
declare function IsNumber(schema?: NumericSchema): SchemaFieldDecorator<NumericSchema>;
declare function IsBigInt(schema?: NumericSchema<bigint>): SchemaFieldDecorator<NumericSchema<bigint>>; // toJsonSchema -> type=string, pattern=^-?\d+$

declare function Ref<T extends object>(ref: ValidateField<() => AnyConstructor<T>>, schema?: ObjectSchema<T>): SchemaFieldDecorator<ValidateSchema<() => AnyConstructor<T>>>;

interface AnyOfSchema<T = any> extends BaseSchema<T> {
    anyOf: SchemaFieldDecorator[];
}

declare function AnyOf<T>(anyOf: SchemaFieldDecorator[], schema?: BaseSchema<T>): SchemaFieldDecorator<AnyOfSchema<T>>;

interface ObjectSchema<T = object> extends BaseSchema<T> {
    properties?: { [K in keyof T]?: SchemaFieldDecorator };
    patternProperties?: Record<string, SchemaFieldDecorator>;
    additionalProperties?: SchemaFieldDecorator;
    propertyNames?: SchemaFieldDecorator;
    dependentSchemas?: { [K in keyof T]?: SchemaFieldDecorator };
    maxProperties?: ValidateField<number>;
    minProperties?: ValidateField<number>;
    required?: ValidateField<Array<keyof T>>;
    dependentRequired?: { [K in keyof T]?: ValidateField<Array<keyof T>> }
}

declare function IsObject<T extends object>(properties: { [K in keyof T]?: SchemaFieldDecorator }, schema?: ObjectSchema<T>): SchemaFieldDecorator<ObjectSchema<T>>
declare function IsRecord<V>(value: SchemaFieldDecorator, schema?: ObjectSchema<Record<string, V>>): SchemaFieldDecorator<ObjectSchema<Record<string, V>>>

// remove checkAllFields
declare function Schema<T>(schema?: ObjectSchema<T>): ClassDecorator<ObjectSchema<T>>;

interface ArraySchema<T = any> extends BaseSchema<T[]> {
    items?: SchemaFieldDecorator;
    // ...
}

declare function IsArray<T>(items: SchemaFieldDecorator, schema?: ArraySchema<T>): SchemaFieldDecorator<ArraySchema<T>>;

// example

enum Gender {
    Male = 1,
    Female = 2,
}

@Schema({description: 'User model'})
class User {
    @IsInteger({minimum: 1})
    id!: number;
    @IsString({minLength: 1, maxLength: 100})
    name!: string;
    @IsEnum(Gender, {nullable: true})
    gender!: Gender | null;
    @IsEmail()
    email!: string;
    @IsArray(Ref(() => Post), {optional: true})
    posts?: Post[];
}

@Schema()
class Post {
    @IsBigInt({minimum: 1n})
    id!: bigint;
    @IsString({minLength: 1, maxLength: 100})
    title!: string;
    @IsString({minLength: 1, maxLength: 10000})
    content!: string;
    @IsInteger()
    authorId!: number;
    @Ref(() => User, {optional: true})
    author?: User;
    @IsDate()
    createdAt!: Date;
    @IsDate()
    updatedAt!: Date;
}

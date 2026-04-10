/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * String format validators powered by validator.js.
 * Uses tree-shakeable ES imports from validator/es/lib/*.
 *
 * API convention:
 * - First param: the validator's own param (primitive or options object)
 * - Second param: StringSchema (carries message, title, etc.)
 * - Return: SchemaFieldDecorator<StringSchema> & statics
 */
import isEmailFn from 'validator/es/lib/isEmail';
import isURLFn from 'validator/es/lib/isURL';
import isUUIDFn from 'validator/es/lib/isUUID';
import isIPFn from 'validator/es/lib/isIP';
import isIPRangeFn from 'validator/es/lib/isIPRange';
import isAlphaFn from 'validator/es/lib/isAlpha';
import isAlphanumericFn from 'validator/es/lib/isAlphanumeric';
import isNumericFn from 'validator/es/lib/isNumeric';
import isAsciiFn from 'validator/es/lib/isAscii';
import isMultibyteFn from 'validator/es/lib/isMultibyte';
import isFullWidthFn from 'validator/es/lib/isFullWidth';
import isHalfWidthFn from 'validator/es/lib/isHalfWidth';
import isVariableWidthFn from 'validator/es/lib/isVariableWidth';
import isSurrogatePairFn from 'validator/es/lib/isSurrogatePair';
import isLowercaseFn from 'validator/es/lib/isLowercase';
import isUppercaseFn from 'validator/es/lib/isUppercase';
import isSlugFn from 'validator/es/lib/isSlug';
import isLocaleFn from 'validator/es/lib/isLocale';
import isEmptyFn from 'validator/es/lib/isEmpty';
import isBase32Fn from 'validator/es/lib/isBase32';
import isBase58Fn from 'validator/es/lib/isBase58';
import isBase64Fn from 'validator/es/lib/isBase64';
import isDataURIFn from 'validator/es/lib/isDataURI';
import isMagnetURIFn from 'validator/es/lib/isMagnetURI';
import isMailtoURIFn from 'validator/es/lib/isMailtoURI';
import isMimeTypeFn from 'validator/es/lib/isMimeType';
import isJSONFn from 'validator/es/lib/isJSON';
import isJWTFn from 'validator/es/lib/isJWT';
import isOctalFn from 'validator/es/lib/isOctal';
import isHexColorFn from 'validator/es/lib/isHexColor';
import isHexadecimalFn from 'validator/es/lib/isHexadecimal';
import isHSLFn from 'validator/es/lib/isHSL';
import isRgbColorFn from 'validator/es/lib/isRgbColor';
import isHashFn from 'validator/es/lib/isHash';
import isMD5Fn from 'validator/es/lib/isMD5';
import isCreditCardFn from 'validator/es/lib/isCreditCard';
import isCurrencyFn from 'validator/es/lib/isCurrency';
import isEANFn from 'validator/es/lib/isEAN';
import isISINFn from 'validator/es/lib/isISIN';
import isISBNFn from 'validator/es/lib/isISBN';
import isEthereumAddressFn from 'validator/es/lib/isEthereumAddress';
import isBtcAddressFn from 'validator/es/lib/isBtcAddress';
import isIBANFn from 'validator/es/lib/isIBAN';
import isBICFn from 'validator/es/lib/isBIC';
import isAbaRoutingFn from 'validator/es/lib/isAbaRouting';
import isVATFn from 'validator/es/lib/isVAT';
import isTaxIDFn from 'validator/es/lib/isTaxID';
import isLuhnNumberFn from 'validator/es/lib/isLuhnNumber';
import isMobilePhoneFn from 'validator/es/lib/isMobilePhone';
import isPassportNumberFn from 'validator/es/lib/isPassportNumber';
import isIdentityCardFn from 'validator/es/lib/isIdentityCard';
// @ts-expect-error - no type declarations for ES module
import isIMEIFn from 'validator/es/lib/isIMEI';
import isLicensePlateFn from 'validator/es/lib/isLicensePlate';
import isFQDNFn from 'validator/es/lib/isFQDN';
import isMACAddressFn from 'validator/es/lib/isMACAddress';
import isPortFn from 'validator/es/lib/isPort';
import isMongoIdFn from 'validator/es/lib/isMongoId';
import isLatLongFn from 'validator/es/lib/isLatLong';
import isPostalCodeFn from 'validator/es/lib/isPostalCode';
import isISO8601Fn from 'validator/es/lib/isISO8601';
import isRFC3339Fn from 'validator/es/lib/isRFC3339';
import isTimeFn from 'validator/es/lib/isTime';
import isISO4217Fn from 'validator/es/lib/isISO4217';
import isISO6346Fn from 'validator/es/lib/isISO6346';
import isISO6391Fn from 'validator/es/lib/isISO6391';
import isISO15924Fn from 'validator/es/lib/isISO15924';
import isISO31661Alpha2Fn from 'validator/es/lib/isISO31661Alpha2';
import isISO31661Alpha3Fn from 'validator/es/lib/isISO31661Alpha3';
import isISO31661NumericFn from 'validator/es/lib/isISO31661Numeric';
import isISRCFn from 'validator/es/lib/isISRC';
import isISSNFn from 'validator/es/lib/isISSN';
// @ts-expect-error - no type declarations for ES module
import isFreightContainerIDFn from 'validator/es/lib/isFreightContainerID';
import isULIDFn from 'validator/es/lib/isULID';
import isSemVerFn from 'validator/es/lib/isSemVer';
import isStrongPasswordFn from 'validator/es/lib/isStrongPassword';
import isFloatFn from 'validator/es/lib/isFloat';
import isIntFn from 'validator/es/lib/isInt';
import isDecimalFn from 'validator/es/lib/isDecimal';
import isDivisibleByFn from 'validator/es/lib/isDivisibleBy';
import isByteLengthFn from 'validator/es/lib/isByteLength';
import isWhitelistedFn from 'validator/es/lib/isWhitelisted';
import isAfterFn from 'validator/es/lib/isAfter';
import isBeforeFn from 'validator/es/lib/isBefore';
import isDateFn from 'validator/es/lib/isDate';

import {
  type UUIDVersion,
  type HashAlgorithm,
  type PostalCodeLocale,
  type AlphaLocale,
  type AlphanumericLocale,
  type MobilePhoneLocale,
  type IdentityCardLocale,
  type IsEmailOptions,
  type IsURLOptions,
  type IsIPOptions,
  type IsNumericOptions,
  type IsEmptyOptions,
  type IsBase32Options,
  type IsBase64Options,
  type IsJSONOptions,
  type IsCreditCardOptions,
  type IsCurrencyOptions,
  type IsIBANOptions,
  type IsFQDNOptions,
  type IsMACAddressOptions,
  type IsISO8601Options,
  type IsTimeOptions,
  type IsISSNOptions,
  type IsFloatOptions,
  type IsIntOptions,
  type IsDecimalOptions,
  type IsByteLengthOptions,
  type IsAfterOptions,
  type IsBeforeOptions,
  type IsDateOptions,
  type StrongPasswordOptions,
  type ISBNVersion,
  type VATCountryCode,
  type IPVersion,
  type IsAlphaOptions as IsAlphaOptions_,
  type IsAlphanumericOptions as IsAlphanumericOptions_,
  type IsMobilePhoneOptions as IsMobilePhoneOptions_,
  type IsIMEIOptions,
} from 'validator';
import type {
  StringSchema,
  SchemaFieldDecorator,
  SchemaFieldDecoratorFactoryStatic,
  ValidateSchema,
  ValidateOptions,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * String validator with no params.
 * Signature: (schema?: StringSchema) => SchemaFieldDecorator
 */
type SV0 = ((schema?: StringSchema) => SchemaFieldDecorator<ValidateOptions>) &
  SchemaFieldDecoratorFactoryStatic<ValidateOptions>;

function sv0(name: string, validateFn: (value: string) => boolean, format?: string): SV0 {
  const ref: { current?: any } = {};
  const factory = createSchemaFieldDecoratorFactory<any>(
    Object.defineProperty(
      function (schema?: StringSchema) {
        return SchemaField(ref.current, (schema ?? {}) as any, [IsString(schema)]);
      },
      'name',
      { value: name },
    ),
    {
      validate: (_: any, v: unknown) => typeof v !== 'string' || validateFn(v),
      toJsonSchema: format ? () => ({ type: 'string', format }) : undefined,
    },
  );
  ref.current = factory;
  return factory as any;
}

/**
 * String validator with an optional primitive param.
 * Signature: (param?: P, schema?: StringSchema) => SchemaFieldDecorator
 */
type SVO<P> = ((
  param?: P,
  schema?: StringSchema,
) => SchemaFieldDecorator<ValidateSchema<P | undefined>>) &
  SchemaFieldDecoratorFactoryStatic<ValidateSchema<P | undefined>>;

function svo<P>(
  name: string,
  validateFn: (value: string, param: P | undefined) => boolean,
  format?: string,
): SVO<P> {
  const ref: { current?: any } = {};
  const factory = createSchemaFieldDecoratorFactory<any>(
    Object.defineProperty(
      function (param?: P, schema?: StringSchema) {
        return SchemaField(ref.current, { value: param, ...(schema ?? {}) } as any, [
          IsString(schema),
        ]);
      },
      'name',
      { value: name },
    ),
    {
      validate: (_: any, v: unknown) => typeof v !== 'string' || validateFn(v, _.value),
      toJsonSchema: format ? () => ({ type: 'string', format }) : undefined,
    },
  );
  ref.current = factory;
  return factory as any;
}

/**
 * String validator with a required primitive param.
 * Signature: (param: P, schema?: StringSchema) => SchemaFieldDecorator
 */
type SVR<P> = ((param: P, schema?: StringSchema) => SchemaFieldDecorator<ValidateSchema<P>>) &
  SchemaFieldDecoratorFactoryStatic<ValidateSchema<P>>;

function svr<P>(
  name: string,
  validateFn: (value: string, param: P) => boolean,
  format?: string,
): SVR<P> {
  const ref: { current?: any } = {};
  const factory = createSchemaFieldDecoratorFactory<any>(
    Object.defineProperty(
      function (param: P, schema?: StringSchema) {
        return SchemaField(ref.current, { value: param, ...(schema ?? {}) } as any, [
          IsString(schema),
        ]);
      },
      'name',
      { value: name },
    ),
    {
      validate: (_: any, v: unknown) => typeof v !== 'string' || validateFn(v, _.value),
      toJsonSchema: format ? () => ({ type: 'string', format }) : undefined,
    },
  );
  ref.current = factory;
  return factory as any;
}

// ---------------------------------------------------------------------------
// Composite option types for multi-param validators
// ---------------------------------------------------------------------------

export interface IsMobilePhoneOptions extends IsMobilePhoneOptions_ {
  locale: MobilePhoneLocale | MobilePhoneLocale[];
}

export interface IsAlphaOptions extends IsAlphaOptions_ {
  locale?: AlphaLocale;
}

export interface IsAlphanumericOptions extends IsAlphanumericOptions_ {
  locale?: AlphanumericLocale;
}

// ---------------------------------------------------------------------------
// Validators: no params
// ---------------------------------------------------------------------------

export const IsAscii = sv0('IsAscii', isAsciiFn);
export const IsMultibyte = sv0('IsMultibyte', isMultibyteFn);
export const IsFullWidth = sv0('IsFullWidth', isFullWidthFn);
export const IsHalfWidth = sv0('IsHalfWidth', isHalfWidthFn);
export const IsVariableWidth = sv0('IsVariableWidth', isVariableWidthFn);
export const IsSurrogatePair = sv0('IsSurrogatePair', isSurrogatePairFn);
export const IsLowercase = sv0('IsLowercase', isLowercaseFn);
export const IsUppercase = sv0('IsUppercase', isUppercaseFn);
export const IsSlug = sv0('IsSlug', isSlugFn);
export const IsLocale = sv0('IsLocale', isLocaleFn);
export const IsBase58 = sv0('IsBase58', isBase58Fn);
export const IsDataURI = sv0('IsDataURI', isDataURIFn);
export const IsMagnetURI = sv0('IsMagnetURI', isMagnetURIFn);
export const IsMailtoURI = sv0('IsMailtoURI', isMailtoURIFn);
export const IsMimeType = sv0('IsMimeType', isMimeTypeFn);
export const IsJWT = sv0('IsJWT', isJWTFn);
export const IsOctal = sv0('IsOctal', isOctalFn);
export const IsHexColor = sv0('IsHexColor', isHexColorFn);
export const IsHexadecimal = sv0('IsHexadecimal', isHexadecimalFn);
export const IsHSL = sv0('IsHSL', isHSLFn);
export const IsMD5 = sv0('IsMD5', isMD5Fn);
export const IsEAN = sv0('IsEAN', isEANFn);
export const IsISIN = sv0('IsISIN', isISINFn);
export const IsEthereumAddress = sv0('IsEthereumAddress', isEthereumAddressFn);
export const IsBtcAddress = sv0('IsBtcAddress', isBtcAddressFn);
export const IsBIC = sv0('IsBIC', isBICFn);
export const IsAbaRouting = sv0('IsAbaRouting', isAbaRoutingFn);
export const IsLuhnNumber = sv0('IsLuhnNumber', isLuhnNumberFn);
export const IsPort = sv0('IsPort', isPortFn);
export const IsMongoId = sv0('IsMongoId', isMongoIdFn);
export const IsRFC3339 = sv0('IsRFC3339', isRFC3339Fn, 'date-time');
export const IsISO4217 = sv0('IsISO4217', isISO4217Fn);
export const IsISO6346 = sv0('IsISO6346', isISO6346Fn);
export const IsISO6391 = sv0('IsISO6391', isISO6391Fn);
export const IsISO15924 = sv0('IsISO15924', isISO15924Fn);
export const IsISO31661Alpha2 = sv0('IsISO31661Alpha2', isISO31661Alpha2Fn);
export const IsISO31661Alpha3 = sv0('IsISO31661Alpha3', isISO31661Alpha3Fn);
export const IsISO31661Numeric = sv0('IsISO31661Numeric', isISO31661NumericFn);
export const IsISRC = sv0('IsISRC', isISRCFn);
export const IsFreightContainerID = sv0('IsFreightContainerID', isFreightContainerIDFn);
export const IsULID = sv0('IsULID', isULIDFn);
export const IsSemVer = sv0('IsSemVer', isSemVerFn);
export const IsLatLong = sv0('IsLatLong', isLatLongFn);

// ---------------------------------------------------------------------------
// Validators: required primitive param
// ---------------------------------------------------------------------------

export const IsHash = svr<HashAlgorithm>('IsHash', isHashFn);
export const IsPostalCode = svr<PostalCodeLocale>('IsPostalCode', isPostalCodeFn);
export const IsVAT = svr<VATCountryCode>('IsVAT', isVATFn);
export const IsTaxID = svr<string>('IsTaxID', isTaxIDFn);
export const IsLicensePlate = svr<string>('IsLicensePlate', (v, p) => !!isLicensePlateFn(v, p));
export const IsDivisibleBy = svr<number>('IsDivisibleBy', isDivisibleByFn);

// ---------------------------------------------------------------------------
// Validators: optional primitive param
// ---------------------------------------------------------------------------

export const IsUUID = svo<UUIDVersion>('IsUUID', isUUIDFn, 'uuid');
export const IsISBN = svo<ISBNVersion>('IsISBN', isISBNFn);
export const IsPassportNumber = svo<string>('IsPassportNumber', isPassportNumberFn);
export const IsIdentityCard = svo<IdentityCardLocale>('IsIdentityCard', isIdentityCardFn);
export const IsRgbColor = svo<boolean>('IsRgbColor', isRgbColorFn);

// ---------------------------------------------------------------------------
// Validators: object options param
// ---------------------------------------------------------------------------

export const IsEmail = svo<IsEmailOptions>('IsEmail', isEmailFn, 'email');
export const IsURL = svo<IsURLOptions>('IsURL', isURLFn, 'uri');
export const IsIP = svo<IsIPOptions>('IsIP', isIPFn, 'ipv4');
export const IsIPRange = svo<IPVersion>('IsIPRange', isIPRangeFn);
export const IsAlpha = svo<IsAlphaOptions>('IsAlpha', (v, p) => isAlphaFn(v, p?.locale, p));
export const IsAlphanumeric = svo<IsAlphanumericOptions>('IsAlphanumeric', (v, p) =>
  isAlphanumericFn(v, p?.locale, p),
);
export const IsNumericString = svo<IsNumericOptions>('IsNumericString', isNumericFn);
export const IsEmpty = svo<IsEmptyOptions>('IsEmpty', isEmptyFn);
export const IsBase32 = svo<IsBase32Options>('IsBase32', isBase32Fn);
export const IsBase64 = svo<IsBase64Options>('IsBase64', isBase64Fn);
export const IsJSON = svo<IsJSONOptions>('IsJSON', isJSONFn);
export const IsCreditCard = svo<IsCreditCardOptions>('IsCreditCard', isCreditCardFn);
export const IsCurrency = svo<IsCurrencyOptions>('IsCurrency', isCurrencyFn);
export const IsIBAN = svo<IsIBANOptions>('IsIBAN', isIBANFn);
export const IsMobilePhone = svr<IsMobilePhoneOptions>('IsMobilePhone', (v, p) =>
  isMobilePhoneFn(v, p.locale, p),
);
export const IsIMEI = svo<IsIMEIOptions>('IsIMEI', isIMEIFn);
export const IsFQDN = svo<IsFQDNOptions>('IsFQDN', isFQDNFn, 'hostname');
export const IsMACAddress = svo<IsMACAddressOptions>('IsMACAddress', isMACAddressFn);
export const IsISO8601 = svo<IsISO8601Options>('IsISO8601', isISO8601Fn, 'date-time');
export const IsTime = svo<IsTimeOptions>('IsTime', isTimeFn, 'time');
export const IsISSN = svo<IsISSNOptions>('IsISSN', isISSNFn);
export const IsStrongPassword = svo<
  StrongPasswordOptions & {
    returnScore?: false | undefined;
  }
>('IsStrongPassword', isStrongPasswordFn);
export const IsFloatString = svo<IsFloatOptions>('IsFloatString', isFloatFn);
export const IsIntString = svo<IsIntOptions>('IsIntString', isIntFn);
export const IsDecimal = svo<IsDecimalOptions>('IsDecimal', isDecimalFn);
export const IsByteLength = svo<IsByteLengthOptions>('IsByteLength', isByteLengthFn);
export const IsWhitelisted = svr<string | string[]>('IsWhitelisted', isWhitelistedFn);
export const IsAfter = svo<IsAfterOptions>('IsAfter', isAfterFn);
export const IsBefore = svo<IsBeforeOptions>('IsBefore', isBeforeFn);
export const IsDateString = svo<IsDateOptions>('IsDateString', isDateFn);

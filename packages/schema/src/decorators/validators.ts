/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * String format validators powered by validator.js.
 * Uses tree-shakeable ES imports and @types/validator option types.
 * Each composes IsString internally and adds format-specific validation.
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

// @ts-expect-error - used for type references like validator.HashAlgorithm
import type validator from 'validator';
import type {
  StringSchema,
  ValidateOptions,
  SchemaFieldDecorator,
  SchemaFieldDecoratorFactory,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Re-export option types from @types/validator
// ---------------------------------------------------------------------------

export type { IsEmailOptions } from 'validator/lib/isEmail';
export type { IsURLOptions } from 'validator/lib/isURL';
export type { IsFQDNOptions } from 'validator/lib/isFQDN';
export type { IsFloatOptions } from 'validator/lib/isFloat';
export type { IsIntOptions as IsIntStringOptions } from 'validator/lib/isInt';
export type { IsDecimalOptions } from 'validator/lib/isDecimal';
export type { IsByteLengthOptions } from 'validator/lib/isByteLength';
export type { IsCurrencyOptions } from 'validator/lib/isCurrency';
export type { IsNumericOptions as IsNumericStringOptions } from 'validator/lib/isNumeric';
export type { IsBase32Options } from 'validator/lib/isBase32';
export type { IsMACAddressOptions } from 'validator/lib/isMACAddress';
export type { IsISSNOptions } from 'validator/lib/isISSN';
export type { IsISO8601Options } from 'validator/lib/isISO8601';
export type { IsTimeOptions } from 'validator/lib/isTime';
export type { IsRgbColorOptions } from 'validator/lib/isRgbColor';
export type { IsAfterOptions } from 'validator/lib/isAfter';
export type { IsBeforeOptions } from 'validator/lib/isBefore';
export type { IsDateOptions as IsDateStringOptions } from 'validator/lib/isDate';
export type { IsMobilePhoneOptions } from 'validator/lib/isMobilePhone';
export type { IsLengthOptions } from 'validator/lib/isLength';
export type { IsLatLongOptions } from 'validator/lib/isLatLong';
export type { IsEmptyOptions } from 'validator/lib/isEmpty';
export type { IsJSONOptions } from 'validator/lib/isJSON';
export type { IsIBANOptions } from 'validator/lib/isIBAN';
export type { StrongPasswordOptions as IsStrongPasswordOptions } from 'validator/lib/isStrongPassword';
export type { IsIPOptions } from 'validator/lib/isIP';

// Types not available in @types/validator — defined inline
export interface IsUUIDOptions extends ValidateOptions {
  version?: 1 | 2 | 3 | 4 | 5 | 7 | 'all';
}
export interface IsHashOptions extends ValidateOptions {
  algorithm: validator.HashAlgorithm;
}
export interface IsISBNOptions extends ValidateOptions {
  version?: 10 | 13;
}
export interface IsAlphaOptions extends ValidateOptions {
  locale?: validator.AlphaLocale;
  ignore?: string | RegExp;
}
export interface IsAlphanumericOptions extends ValidateOptions {
  locale?: validator.AlphanumericLocale;
  ignore?: string | RegExp;
}
export interface IsCreditCardOptions extends ValidateOptions {
  provider?: 'amex' | 'dinersclub' | 'discover' | 'jcb' | 'mastercard' | 'unionpay' | 'visa';
}
export interface IsVATOptions extends ValidateOptions {
  countryCode: string;
}
export interface IsTaxIDOptions extends ValidateOptions {
  locale: string;
}
export interface IsPassportNumberOptions extends ValidateOptions {
  countryCode?: string;
}
export interface IsIdentityCardOptions extends ValidateOptions {
  locale?: validator.IdentityCardLocale;
}
export interface IsIMEIOptions extends ValidateOptions {
  allow_hyphens?: boolean;
}
export interface IsLicensePlateOptions extends ValidateOptions {
  locale: string;
}
export interface IsPostalCodeOptions extends ValidateOptions {
  locale: validator.PostalCodeLocale;
}
export interface IsDivisibleByOptions extends ValidateOptions {
  divisor: number;
}
export interface IsWhitelistedOptions extends ValidateOptions {
  chars: string | string[];
}
export interface IsBase64Options extends ValidateOptions {
  urlSafe?: boolean;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sv<P = ValidateOptions>(
  name: string,
  validateFn: (value: string, params: P) => boolean,
  format?: string,
): SchemaFieldDecoratorFactory<P> {
  const ref: { current?: SchemaFieldDecoratorFactory<P> } = {};
  const factory = createSchemaFieldDecoratorFactory<any>(
    Object.defineProperty(
      function (options?: P, schema?: StringSchema): SchemaFieldDecorator<P> {
        return SchemaField(ref.current as any, (options ?? {}) as any, [IsString(schema)]) as any;
      },
      'name',
      { value: name },
    ),
    {
      validate: (p: any, v: unknown) => typeof v !== 'string' || validateFn(v, p),
      toJsonSchema: format ? () => ({ type: 'string', format }) : undefined,
    },
  ) as unknown as SchemaFieldDecoratorFactory<P>;
  ref.current = factory;
  return factory;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export const IsEmail = sv<validator.IsEmailOptions>('IsEmail', (v, p) => isEmailFn(v, p), 'email');
export const IsURL = sv<validator.IsURLOptions>('IsURL', (v, p) => isURLFn(v, p), 'uri');
export const IsUUID = sv<IsUUIDOptions>('IsUUID', (v, p) => isUUIDFn(v, p.version), 'uuid');
export const IsIP = sv<validator.IsIPOptions>('IsIP', (v, p) => isIPFn(v, p), 'ipv4');
export const IsIPRange = sv<validator.IsIPOptions>('IsIPRange', (v, p) =>
  isIPRangeFn(v, p.version),
);
export const IsAlpha = sv<IsAlphaOptions>('IsAlpha', (v, p) =>
  isAlphaFn(v, p.locale, { ignore: p.ignore }),
);
export const IsAlphanumeric = sv<IsAlphanumericOptions>('IsAlphanumeric', (v, p) =>
  isAlphanumericFn(v, p.locale, { ignore: p.ignore }),
);
export const IsNumericString = sv<validator.IsNumericOptions>('IsNumericString', (v, p) =>
  isNumericFn(v, p),
);
export const IsAscii = sv('IsAscii', (v) => isAsciiFn(v));
export const IsMultibyte = sv('IsMultibyte', (v) => isMultibyteFn(v));
export const IsFullWidth = sv('IsFullWidth', (v) => isFullWidthFn(v));
export const IsHalfWidth = sv('IsHalfWidth', (v) => isHalfWidthFn(v));
export const IsVariableWidth = sv('IsVariableWidth', (v) => isVariableWidthFn(v));
export const IsSurrogatePair = sv('IsSurrogatePair', (v) => isSurrogatePairFn(v));
export const IsLowercase = sv('IsLowercase', (v) => isLowercaseFn(v));
export const IsUppercase = sv('IsUppercase', (v) => isUppercaseFn(v));
export const IsSlug = sv('IsSlug', (v) => isSlugFn(v));
export const IsLocale = sv('IsLocale', (v) => isLocaleFn(v));
export const IsEmpty = sv<validator.IsEmptyOptions>('IsEmpty', (v, p) => isEmptyFn(v, p));
export const IsBase32 = sv<validator.IsBase32Options>('IsBase32', (v, p) => isBase32Fn(v, p));
export const IsBase58 = sv('IsBase58', (v) => isBase58Fn(v));
export const IsBase64 = sv<IsBase64Options>('IsBase64', (v, p) => isBase64Fn(v, p));
export const IsDataURI = sv('IsDataURI', (v) => isDataURIFn(v));
export const IsMagnetURI = sv('IsMagnetURI', (v) => isMagnetURIFn(v));
export const IsMailtoURI = sv('IsMailtoURI', (v) => isMailtoURIFn(v));
export const IsMimeType = sv('IsMimeType', (v) => isMimeTypeFn(v));
export const IsJSON = sv<validator.IsJSONOptions>('IsJSON', (v, p) => isJSONFn(v, p));
export const IsJWT = sv('IsJWT', (v) => isJWTFn(v));
export const IsOctal = sv('IsOctal', (v) => isOctalFn(v));
export const IsHexColor = sv('IsHexColor', (v) => isHexColorFn(v));
export const IsHexadecimal = sv('IsHexadecimal', (v) => isHexadecimalFn(v));
export const IsHSL = sv('IsHSL', (v) => isHSLFn(v));
export const IsRgbColor = sv<validator.IsRgbColorOptions>('IsRgbColor', (v, p) =>
  isRgbColorFn(v, p.includePercentValues),
);
export const IsHash = sv<IsHashOptions>('IsHash', (v, p) => isHashFn(v, p.algorithm));
export const IsMD5 = sv('IsMD5', (v) => isMD5Fn(v));
export const IsCreditCard = sv<IsCreditCardOptions>('IsCreditCard', (v, p) =>
  isCreditCardFn(v, p as any),
);
export const IsCurrency = sv<validator.IsCurrencyOptions>('IsCurrency', (v, p) =>
  isCurrencyFn(v, p),
);
export const IsEAN = sv('IsEAN', (v) => isEANFn(v));
export const IsISIN = sv('IsISIN', (v) => isISINFn(v));
export const IsISBN = sv<IsISBNOptions>('IsISBN', (v, p) => isISBNFn(v, p.version));
export const IsEthereumAddress = sv('IsEthereumAddress', (v) => isEthereumAddressFn(v));
export const IsBtcAddress = sv('IsBtcAddress', (v) => isBtcAddressFn(v));
export const IsIBAN = sv<validator.IsIBANOptions>('IsIBAN', (v, p) => isIBANFn(v, p));
export const IsBIC = sv('IsBIC', (v) => isBICFn(v));
export const IsAbaRouting = sv('IsAbaRouting', (v) => isAbaRoutingFn(v));
export const IsVAT = sv<IsVATOptions>('IsVAT', (v, p) => isVATFn(v, p.countryCode as any));
export const IsTaxID = sv<IsTaxIDOptions>('IsTaxID', (v, p) => isTaxIDFn(v, p.locale));
export const IsLuhnNumber = sv('IsLuhnNumber', (v) => isLuhnNumberFn(v));
export const IsMobilePhone = sv<validator.IsMobilePhoneOptions>('IsMobilePhone', (v, p) =>
  isMobilePhoneFn(v, undefined as any, p),
);
export const IsPassportNumber = sv<IsPassportNumberOptions>('IsPassportNumber', (v, p) =>
  isPassportNumberFn(v, p.countryCode),
);
export const IsIdentityCard = sv<IsIdentityCardOptions>('IsIdentityCard', (v, p) =>
  isIdentityCardFn(v, p.locale),
);
export const IsIMEI = sv<IsIMEIOptions>('IsIMEI', (v, p) => isIMEIFn(v, p));
export const IsLicensePlate = sv<IsLicensePlateOptions>(
  'IsLicensePlate',
  (v, p) => !!isLicensePlateFn(v, p.locale),
);
export const IsFQDN = sv<validator.IsFQDNOptions>('IsFQDN', (v, p) => isFQDNFn(v, p), 'hostname');
export const IsMACAddress = sv<validator.IsMACAddressOptions>('IsMACAddress', (v, p) =>
  isMACAddressFn(v, p),
);
export const IsPort = sv('IsPort', (v) => isPortFn(v));
export const IsMongoId = sv('IsMongoId', (v) => isMongoIdFn(v));
export const IsLatLong = sv<validator.IsLatLongOptions>('IsLatLong', (v, p) => isLatLongFn(v, p));
export const IsPostalCode = sv<IsPostalCodeOptions>('IsPostalCode', (v, p) =>
  isPostalCodeFn(v, p.locale),
);
export const IsISO8601 = sv<validator.IsISO8601Options>(
  'IsISO8601',
  (v, p) => isISO8601Fn(v, p),
  'date-time',
);
export const IsRFC3339 = sv('IsRFC3339', (v) => isRFC3339Fn(v), 'date-time');
export const IsTime = sv<validator.IsTimeOptions>('IsTime', (v, p) => isTimeFn(v, p), 'time');
export const IsISO4217 = sv('IsISO4217', (v) => isISO4217Fn(v));
export const IsISO6346 = sv('IsISO6346', (v) => isISO6346Fn(v));
export const IsISO6391 = sv('IsISO6391', (v) => isISO6391Fn(v));
export const IsISO15924 = sv('IsISO15924', (v) => isISO15924Fn(v));
export const IsISO31661Alpha2 = sv('IsISO31661Alpha2', (v) => isISO31661Alpha2Fn(v));
export const IsISO31661Alpha3 = sv('IsISO31661Alpha3', (v) => isISO31661Alpha3Fn(v));
export const IsISO31661Numeric = sv('IsISO31661Numeric', (v) => isISO31661NumericFn(v));
export const IsISRC = sv('IsISRC', (v) => isISRCFn(v));
export const IsISSN = sv<validator.IsISSNOptions>('IsISSN', (v, p) => isISSNFn(v, p));
export const IsFreightContainerID = sv('IsFreightContainerID', (v) => isFreightContainerIDFn(v));
export const IsULID = sv('IsULID', (v) => isULIDFn(v));
export const IsSemVer = sv('IsSemVer', (v) => isSemVerFn(v));
export const IsStrongPassword = sv<validator.StrongPasswordOptions>(
  'IsStrongPassword',
  (v, p) => !!isStrongPasswordFn(v, p),
);
export const IsFloatString = sv<validator.IsFloatOptions>('IsFloatString', (v, p) =>
  isFloatFn(v, p),
);
export const IsIntString = sv<validator.IsIntOptions>('IsIntString', (v, p) => isIntFn(v, p));
export const IsDecimal = sv<validator.IsDecimalOptions>('IsDecimal', (v, p) => isDecimalFn(v, p));
export const IsDivisibleBy = sv<IsDivisibleByOptions>('IsDivisibleBy', (v, p) =>
  isDivisibleByFn(v, p.divisor),
);
export const IsByteLength = sv<validator.IsByteLengthOptions>('IsByteLength', (v, p) =>
  isByteLengthFn(v, p),
);
export const IsWhitelisted = sv<IsWhitelistedOptions>('IsWhitelisted', (v, p) =>
  isWhitelistedFn(v, p.chars),
);
export const IsAfter = sv<validator.IsAfterOptions>('IsAfter', (v, p) =>
  isAfterFn(v, p.comparisonDate),
);
export const IsBefore = sv<validator.IsBeforeOptions>('IsBefore', (v, p) =>
  isBeforeFn(v, p.comparisonDate),
);
export const IsDateString = sv<validator.IsDateOptions>('IsDateString', (v, p) => isDateFn(v, p));

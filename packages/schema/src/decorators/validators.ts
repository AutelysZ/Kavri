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
import isEmail from 'validator/es/lib/isEmail';
import isURL from 'validator/es/lib/isURL';
import isUUID from 'validator/es/lib/isUUID';
import isIP from 'validator/es/lib/isIP';
import isIPRange from 'validator/es/lib/isIPRange';
import isAlpha from 'validator/es/lib/isAlpha';
import isAlphanumeric from 'validator/es/lib/isAlphanumeric';
import isNumeric from 'validator/es/lib/isNumeric';
import isAscii from 'validator/es/lib/isAscii';
import isMultibyte from 'validator/es/lib/isMultibyte';
import isFullWidth from 'validator/es/lib/isFullWidth';
import isHalfWidth from 'validator/es/lib/isHalfWidth';
import isVariableWidth from 'validator/es/lib/isVariableWidth';
import isSurrogatePair from 'validator/es/lib/isSurrogatePair';
import isLowercase from 'validator/es/lib/isLowercase';
import isUppercase from 'validator/es/lib/isUppercase';
import isSlug from 'validator/es/lib/isSlug';
import isLocale from 'validator/es/lib/isLocale';
import isEmpty from 'validator/es/lib/isEmpty';
import isDataURI from 'validator/es/lib/isDataURI';
import isMagnetURI from 'validator/es/lib/isMagnetURI';
import isMailtoURI from 'validator/es/lib/isMailtoURI';
import isMimeType from 'validator/es/lib/isMimeType';
import isJWT from 'validator/es/lib/isJWT';
import isOctal from 'validator/es/lib/isOctal';
import isHexColor from 'validator/es/lib/isHexColor';
import isHexadecimal from 'validator/es/lib/isHexadecimal';
import isHSL from 'validator/es/lib/isHSL';
import isRgbColor from 'validator/es/lib/isRgbColor';
import isHash from 'validator/es/lib/isHash';
import isMD5 from 'validator/es/lib/isMD5';
import isCreditCard from 'validator/es/lib/isCreditCard';
import isCurrency from 'validator/es/lib/isCurrency';
import isEAN from 'validator/es/lib/isEAN';
import isISIN from 'validator/es/lib/isISIN';
import isISBN from 'validator/es/lib/isISBN';
import isEthereumAddress from 'validator/es/lib/isEthereumAddress';
import isBtcAddress from 'validator/es/lib/isBtcAddress';
import isIBAN from 'validator/es/lib/isIBAN';
import isBIC from 'validator/es/lib/isBIC';
import isAbaRouting from 'validator/es/lib/isAbaRouting';
import isVAT from 'validator/es/lib/isVAT';
import isTaxID from 'validator/es/lib/isTaxID';
import isLuhnNumber from 'validator/es/lib/isLuhnNumber';
import isMobilePhone from 'validator/es/lib/isMobilePhone';
import isPassportNumber from 'validator/es/lib/isPassportNumber';
import isIdentityCard from 'validator/es/lib/isIdentityCard';
// @ts-expect-error - no type declarations for ES module
import isIMEI from 'validator/es/lib/isIMEI';
import isLicensePlate from 'validator/es/lib/isLicensePlate';
import isFQDN from 'validator/es/lib/isFQDN';
import isMACAddress from 'validator/es/lib/isMACAddress';
import isPort from 'validator/es/lib/isPort';
import isMongoId from 'validator/es/lib/isMongoId';
import isLatLong from 'validator/es/lib/isLatLong';
import isPostalCode from 'validator/es/lib/isPostalCode';
import isISO8601 from 'validator/es/lib/isISO8601';
import isRFC3339 from 'validator/es/lib/isRFC3339';
import isTime from 'validator/es/lib/isTime';
import isISO4217 from 'validator/es/lib/isISO4217';
import isISO6346 from 'validator/es/lib/isISO6346';
import isISO6391 from 'validator/es/lib/isISO6391';
import isISO15924 from 'validator/es/lib/isISO15924';
import isISO31661Alpha2 from 'validator/es/lib/isISO31661Alpha2';
import isISO31661Alpha3 from 'validator/es/lib/isISO31661Alpha3';
import isISO31661Numeric from 'validator/es/lib/isISO31661Numeric';
import isISRC from 'validator/es/lib/isISRC';
import isISSN from 'validator/es/lib/isISSN';
// @ts-expect-error - no type declarations for ES module
import isFreightContainerID from 'validator/es/lib/isFreightContainerID';
import isULID from 'validator/es/lib/isULID';
import isSemVer from 'validator/es/lib/isSemVer';
import isStrongPassword from 'validator/es/lib/isStrongPassword';
import isFloat from 'validator/es/lib/isFloat';
import isInt from 'validator/es/lib/isInt';
import isDecimal from 'validator/es/lib/isDecimal';
import isDivisibleBy from 'validator/es/lib/isDivisibleBy';
import isByteLength from 'validator/es/lib/isByteLength';
import isWhitelisted from 'validator/es/lib/isWhitelisted';
import isDate from 'validator/es/lib/isDate';

import {
  type AlphaLocale,
  type AlphanumericLocale,
  type HashAlgorithm,
  type IdentityCardLocale,
  type IPVersion,
  type IsAlphanumericOptions as IsAlphanumericOptions_,
  type IsAlphaOptions as IsAlphaOptions_,
  type ISBNVersion,
  type IsByteLengthOptions,
  type IsCreditCardOptions,
  type IsCurrencyOptions,
  type IsDateOptions,
  type IsDecimalOptions,
  type IsEmailOptions,
  type IsEmptyOptions,
  type IsFloatOptions,
  type IsFQDNOptions,
  type IsIBANOptions,
  type IsIMEIOptions,
  type IsIntOptions,
  type IsIPOptions,
  type IsISO8601Options,
  type IsISSNOptions,
  type IsMACAddressOptions,
  type IsMobilePhoneOptions as IsMobilePhoneOptions_,
  type IsNumericOptions,
  type IsTimeOptions,
  type IsURLOptions,
  type MobilePhoneLocale,
  type PostalCodeLocale,
  type StrongPasswordOptions as StrongPasswordOptions_,
  type UUIDVersion,
  type VATCountryCode,
} from 'validator';
import {
  type SchemaFieldDecorator,
  type SchemaFieldDecoratorFactoryStatic,
  type StringSchema,
  type ValidateOptions,
  type ValidateSchema,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sv(rule: string, validateFn: (value: string, param?: any) => boolean, format?: string) {
  const factory = createSchemaFieldDecoratorFactory(
    rule,
    (param?: any, schema?: StringSchema): SchemaFieldDecorator<ValidateSchema<any>> => {
      return SchemaField(factory, { value: param, ...(schema ?? {}) } as any, undefined, [
        IsString(schema),
      ]);
    },
    {
      validate: (_: any, v: unknown) => {
        return (
          typeof v !== 'string' || (_.value === void 0 ? validateFn(v) : validateFn(v, _.value))
        );
      },
      message: '.label is invalid',
      toJsonSchema: () => (format ? { type: 'string', format } : void 0),
      fromJsonSchema: (_: any, schema): any =>
        format && schema.format === format ? factory() : void 0,
    },
  );
  return factory as any;
}

/**
 * String validator with no params.
 * Signature: (schema?: StringSchema) => SchemaFieldDecorator
 */
type SV0 = ((schema?: StringSchema) => SchemaFieldDecorator<ValidateOptions>) &
  SchemaFieldDecoratorFactoryStatic<ValidateOptions>;

function sv0(rule: string, validateFn: (value: string) => boolean, format?: string): SV0 {
  return sv(rule, validateFn, format);
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
  rule: string,
  validateFn: (value: string, param: P | undefined) => boolean,
  format?: string,
): SVO<P> {
  return sv(rule, validateFn, format);
}

/**
 * String validator with a required primitive param.
 * Signature: (param: P, schema?: StringSchema) => SchemaFieldDecorator
 */
type SVR<P> = ((param: P, schema?: StringSchema) => SchemaFieldDecorator<ValidateSchema<P>>) &
  SchemaFieldDecoratorFactoryStatic<ValidateSchema<P>>;

function svr<P>(
  rule: string,
  validateFn: (value: string, param: P) => boolean,
  format?: string,
): SVR<P> {
  return sv(rule, validateFn, format);
}

// ---------------------------------------------------------------------------
// Composite option types for multi-param validators
// ---------------------------------------------------------------------------

interface IsMobilePhoneOptions extends IsMobilePhoneOptions_ {
  locale: MobilePhoneLocale | MobilePhoneLocale[];
}

interface IsAlphaOptions extends IsAlphaOptions_ {
  locale?: AlphaLocale;
}

interface IsAlphanumericOptions extends IsAlphanumericOptions_ {
  locale?: AlphanumericLocale;
}

interface StrongPasswordOptions extends StrongPasswordOptions_ {
  returnScore?: false | undefined;
}

// ---------------------------------------------------------------------------
// Validators: no params
// ---------------------------------------------------------------------------

export const IsAscii = sv0('IsAscii', isAscii);
export const IsMultibyte = sv0('IsMultibyte', isMultibyte);
export const IsFullWidth = sv0('IsFullWidth', isFullWidth);
export const IsHalfWidth = sv0('IsHalfWidth', isHalfWidth);
export const IsVariableWidth = sv0('IsVariableWidth', isVariableWidth);
export const IsSurrogatePair = sv0('IsSurrogatePair', isSurrogatePair);
export const IsLowercase = sv0('IsLowercase', isLowercase);
export const IsUppercase = sv0('IsUppercase', isUppercase);
export const IsSlug = sv0('IsSlug', isSlug);
export const IsLocale = sv0('IsLocale', isLocale);
export const IsDataURI = sv0('IsDataURI', isDataURI);
export const IsMagnetURI = sv0('IsMagnetURI', isMagnetURI);
export const IsMailtoURI = sv0('IsMailtoURI', isMailtoURI);
export const IsMimeType = sv0('IsMimeType', isMimeType);
export const IsJWT = sv0('IsJWT', isJWT);
export const IsOctal = sv0('IsOctal', isOctal);
export const IsHexColor = sv0('IsHexColor', isHexColor);
export const IsHexadecimal = sv0('IsHexadecimal', isHexadecimal);
export const IsHSL = sv0('IsHSL', isHSL);
export const IsMD5 = sv0('IsMD5', isMD5);
export const IsEAN = sv0('IsEAN', isEAN);
export const IsISIN = sv0('IsISIN', isISIN);
export const IsEthereumAddress = sv0('IsEthereumAddress', isEthereumAddress);
export const IsBtcAddress = sv0('IsBtcAddress', isBtcAddress);
export const IsBIC = sv0('IsBIC', isBIC);
export const IsAbaRouting = sv0('IsAbaRouting', isAbaRouting);
export const IsLuhnNumber = sv0('IsLuhnNumber', isLuhnNumber);
export const IsPort = sv0('IsPort', isPort);
export const IsMongoId = sv0('IsMongoId', isMongoId);
export const IsRFC3339 = sv0('IsRFC3339', isRFC3339, 'date-time');
export const IsISO4217 = sv0('IsISO4217', isISO4217);
export const IsISO6346 = sv0('IsISO6346', isISO6346);
export const IsISO6391 = sv0('IsISO6391', isISO6391);
export const IsISO15924 = sv0('IsISO15924', isISO15924);
export const IsISO31661Alpha2 = sv0('IsISO31661Alpha2', isISO31661Alpha2);
export const IsISO31661Alpha3 = sv0('IsISO31661Alpha3', isISO31661Alpha3);
export const IsISO31661Numeric = sv0('IsISO31661Numeric', isISO31661Numeric);
export const IsISRC = sv0('IsISRC', isISRC);
export const IsFreightContainerID = sv0('IsFreightContainerID', isFreightContainerID);
export const IsULID = sv0('IsULID', isULID);
export const IsSemVer = sv0('IsSemVer', isSemVer);
export const IsLatLong = sv0('IsLatLong', isLatLong);

// ---------------------------------------------------------------------------
// Validators: required primitive param
// ---------------------------------------------------------------------------

export const IsHash = svr<HashAlgorithm>('IsHash', isHash);
export const IsPostalCode = svr<PostalCodeLocale>('IsPostalCode', isPostalCode);
export const IsVAT = svr<VATCountryCode>('IsVAT', isVAT);
export const IsTaxID = svr<string>('IsTaxID', isTaxID);
export const IsLicensePlate = svr<string>('IsLicensePlate', (v, p) => !!isLicensePlate(v, p));
export const IsDivisibleBy = svr<number>('IsDivisibleBy', isDivisibleBy);

// ---------------------------------------------------------------------------
// Validators: optional primitive param
// ---------------------------------------------------------------------------

export const IsUUID = svo<UUIDVersion>('IsUUID', isUUID, 'uuid');
export const IsISBN = svo<ISBNVersion>('IsISBN', isISBN);
export const IsPassportNumber = svo<string>('IsPassportNumber', isPassportNumber);
export const IsIdentityCard = svo<IdentityCardLocale>('IsIdentityCard', isIdentityCard);
export const IsRgbColor = svo<boolean>('IsRgbColor', isRgbColor);

// ---------------------------------------------------------------------------
// Validators: object options param
// ---------------------------------------------------------------------------

export const IsEmail = svo<IsEmailOptions>('IsEmail', isEmail, 'email');
export const IsURL = svo<IsURLOptions>('IsURL', isURL, 'uri');
export const IsIP = svo<IsIPOptions>('IsIP', isIP, 'ipv4');
export const IsIPRange = svo<IPVersion>('IsIPRange', isIPRange);
export const IsAlpha = svo<IsAlphaOptions>('IsAlpha', (v, p) => isAlpha(v, p?.locale, p));
export const IsAlphanumeric = svo<IsAlphanumericOptions>('IsAlphanumeric', (v, p) =>
  isAlphanumeric(v, p?.locale, p),
);
export const IsNumericString = svo<IsNumericOptions>('IsNumericString', isNumeric);
export const IsEmpty = svo<IsEmptyOptions>('IsEmpty', isEmpty);
export const IsCreditCard = svo<IsCreditCardOptions>('IsCreditCard', isCreditCard);
export const IsCurrency = svo<IsCurrencyOptions>('IsCurrency', isCurrency);
export const IsIBAN = svo<IsIBANOptions>('IsIBAN', isIBAN);
export const IsMobilePhone = svr<IsMobilePhoneOptions>('IsMobilePhone', (v, p) =>
  isMobilePhone(v, p.locale, p),
);
export const IsIMEI = svo<IsIMEIOptions>('IsIMEI', isIMEI);
export const IsFQDN = svo<IsFQDNOptions>('IsFQDN', isFQDN, 'hostname');
export const IsMACAddress = svo<IsMACAddressOptions>('IsMACAddress', isMACAddress);
export const IsISO8601 = svo<IsISO8601Options>('IsISO8601', isISO8601, 'date-time');
export const IsTime = svo<IsTimeOptions>('IsTime', isTime, 'time');
export const IsISSN = svo<IsISSNOptions>('IsISSN', isISSN);
export const IsStrongPassword = svo<StrongPasswordOptions>('IsStrongPassword', isStrongPassword);
export const IsFloatString = svo<IsFloatOptions>('IsFloatString', isFloat);
export const IsIntString = svo<IsIntOptions>('IsIntString', isInt);
export const IsDecimal = svo<IsDecimalOptions>('IsDecimal', isDecimal);
export const IsByteLength = svo<IsByteLengthOptions>('IsByteLength', isByteLength);
export const IsWhitelisted = svr<string | string[]>('IsWhitelisted', isWhitelisted);
export const IsDateString = svo<IsDateOptions>('IsDateString', isDate);

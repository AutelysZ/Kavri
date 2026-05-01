import type {
  AlphaLocale,
  AlphanumericLocale,
  IsAlphanumericOptions as IsAlphanumericOptions_,
  IsAlphaOptions as IsAlphaOptions_,
  IsMobilePhoneOptions as IsMobilePhoneOptions_,
  LicensePlateLocale,
  MobilePhoneLocale,
  StrongPasswordOptions as StrongPasswordOptions_,
} from 'validator';
import isAbaRouting from 'validator/es/lib/isAbaRouting.js';
import isAlpha from 'validator/es/lib/isAlpha.js';
import isAlphanumeric from 'validator/es/lib/isAlphanumeric.js';
import isAscii from 'validator/es/lib/isAscii.js';
import isBIC from 'validator/es/lib/isBIC.js';
import isBtcAddress from 'validator/es/lib/isBtcAddress.js';
import isByteLength from 'validator/es/lib/isByteLength.js';
import isCreditCard from 'validator/es/lib/isCreditCard.js';
import isCurrency from 'validator/es/lib/isCurrency.js';
import isDataURI from 'validator/es/lib/isDataURI.js';
import isDate from 'validator/es/lib/isDate.js';
import isDecimal from 'validator/es/lib/isDecimal.js';
import isDivisibleBy from 'validator/es/lib/isDivisibleBy.js';
import isEAN from 'validator/es/lib/isEAN.js';
import isEmail from 'validator/es/lib/isEmail.js';
import isEmpty from 'validator/es/lib/isEmpty.js';
import isEthereumAddress from 'validator/es/lib/isEthereumAddress.js';
import isFloat from 'validator/es/lib/isFloat.js';
import isFQDN from 'validator/es/lib/isFQDN.js';
// @ts-expect-error - no type declarations for ES module
import isFreightContainerID from 'validator/es/lib/isFreightContainerID.js';
import isFullWidth from 'validator/es/lib/isFullWidth.js';
import isHalfWidth from 'validator/es/lib/isHalfWidth.js';
import isHash from 'validator/es/lib/isHash.js';
import isHexadecimal from 'validator/es/lib/isHexadecimal.js';
import isHexColor from 'validator/es/lib/isHexColor.js';
import isHSL from 'validator/es/lib/isHSL.js';
import isIBAN from 'validator/es/lib/isIBAN.js';
import isIdentityCard from 'validator/es/lib/isIdentityCard.js';
// @ts-expect-error - no type declarations for ES module
import isIMEI from 'validator/es/lib/isIMEI.js';
import isInt from 'validator/es/lib/isInt.js';
import isIP from 'validator/es/lib/isIP.js';
import isIPRange from 'validator/es/lib/isIPRange.js';
import isISBN from 'validator/es/lib/isISBN.js';
import isISIN from 'validator/es/lib/isISIN.js';
import isISO15924 from 'validator/es/lib/isISO15924.js';
import isISO31661Alpha2 from 'validator/es/lib/isISO31661Alpha2.js';
import isISO31661Alpha3 from 'validator/es/lib/isISO31661Alpha3.js';
import isISO31661Numeric from 'validator/es/lib/isISO31661Numeric.js';
import isISO4217 from 'validator/es/lib/isISO4217.js';
import isISO6346 from 'validator/es/lib/isISO6346.js';
import isISO6391 from 'validator/es/lib/isISO6391.js';
import isISO8601 from 'validator/es/lib/isISO8601.js';
import isISRC from 'validator/es/lib/isISRC.js';
import isISSN from 'validator/es/lib/isISSN.js';
import isJWT from 'validator/es/lib/isJWT.js';
import isLatLong from 'validator/es/lib/isLatLong.js';
import isLicensePlate from 'validator/es/lib/isLicensePlate.js';
import isLocale from 'validator/es/lib/isLocale.js';
import isLowercase from 'validator/es/lib/isLowercase.js';
import isLuhnNumber from 'validator/es/lib/isLuhnNumber.js';
import isMACAddress from 'validator/es/lib/isMACAddress.js';
import isMagnetURI from 'validator/es/lib/isMagnetURI.js';
import isMailtoURI from 'validator/es/lib/isMailtoURI.js';
import isMD5 from 'validator/es/lib/isMD5.js';
import isMimeType from 'validator/es/lib/isMimeType.js';
import isMobilePhone from 'validator/es/lib/isMobilePhone.js';
import isMongoId from 'validator/es/lib/isMongoId.js';
import isMultibyte from 'validator/es/lib/isMultibyte.js';
import isNumeric from 'validator/es/lib/isNumeric.js';
import isOctal from 'validator/es/lib/isOctal.js';
import isPassportNumber from 'validator/es/lib/isPassportNumber.js';
import isPort from 'validator/es/lib/isPort.js';
import isPostalCode from 'validator/es/lib/isPostalCode.js';
import isRFC3339 from 'validator/es/lib/isRFC3339.js';
import isRgbColor from 'validator/es/lib/isRgbColor.js';
import isSemVer from 'validator/es/lib/isSemVer.js';
import isSlug from 'validator/es/lib/isSlug.js';
import isStrongPassword from 'validator/es/lib/isStrongPassword.js';
import isSurrogatePair from 'validator/es/lib/isSurrogatePair.js';
import isTaxID from 'validator/es/lib/isTaxID.js';
import isTime from 'validator/es/lib/isTime.js';
import isULID from 'validator/es/lib/isULID.js';
import isUppercase from 'validator/es/lib/isUppercase.js';
import isURL from 'validator/es/lib/isURL.js';
import isUUID from 'validator/es/lib/isUUID.js';
import isVariableWidth from 'validator/es/lib/isVariableWidth.js';
import isVAT from 'validator/es/lib/isVAT.js';
import isWhitelisted from 'validator/es/lib/isWhitelisted.js';
import {
  createFieldSchemaDecoratorFactory,
  decoupleOptions,
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorFactory,
  type FieldSchemaDecoratorFactoryStatic,
  Phase,
} from '../field.js';
import { isString } from '../utils.js';
import { IsString, type StringOptions } from './string.js';

function sv(
  rule: string,
  noArg: boolean,
  validateFn: (value: string, param: unknown) => boolean,
  format?: string,
) {
  const factory = createFieldSchemaDecoratorFactory(
    rule,
    (...args: unknown[]): FieldSchemaDecorator<unknown> => {
      const [opts, info] = decoupleOptions(args[noArg ? 0 : 1] ?? {});
      return FieldSchema<unknown>(factory, noArg ? void 0 : args[0], opts, [IsString(info)]);
    },
    {
      phase: Phase.Semantics,
      decode: ({ params, value }) => {
        return !isString(value) || validateFn(value, params);
      },
      message: '.label is invalid',
      toJsonSchema: format ? () => ({ format }) : void 0,
      fromJsonSchema: format
        ? (schema): FieldSchemaDecorator | undefined => {
            const args = noArg ? [{ type: false }] : [void 0, { type: false }];
            return schema.format === format ? factory(...args) : void 0;
          }
        : void 0,
    },
  );
  return factory as FieldSchemaDecoratorFactory;
}

export type SV0 = ((schema?: StringOptions) => FieldSchemaDecorator<undefined>) &
  FieldSchemaDecoratorFactoryStatic<undefined>;

function sv0(rule: string, validateFn: (value: string) => boolean, format?: string): SV0 {
  return sv(rule, true, validateFn as never, format);
}

export type SVO<P> = ((param?: P, schema?: StringOptions) => FieldSchemaDecorator<P | undefined>) &
  FieldSchemaDecoratorFactoryStatic<P | undefined>;

function svo<P>(
  rule: string,
  validateFn: (value: string, param?: P) => boolean,
  format?: string,
): SVO<P> {
  return sv(rule, false, validateFn as never, format);
}

export type SVR<P> = ((param: P, schema?: StringOptions) => FieldSchemaDecorator<P>) &
  FieldSchemaDecoratorFactoryStatic<P>;

function svr<P>(
  rule: string,
  validateFn: (value: string, param: P) => boolean,
  format?: string,
): SVR<P> {
  return sv(rule, false, validateFn as never, format);
}

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

export const IsMailtoURI = svo('IsMailtoURI', isMailtoURI);
export const IsLatLong = svo('IsLatLong', isLatLong);
export const IsUUID = svo('IsUUID', isUUID, 'uuid');
export const IsISBN = svo('IsISBN', isISBN);
export const IsPassportNumber = svo('IsPassportNumber', isPassportNumber);
export const IsIdentityCard = svo('IsIdentityCard', isIdentityCard);
export const IsRgbColor = svo('IsRgbColor', isRgbColor);

export const IsEmail = svo('IsEmail', isEmail, 'email');
export const IsURL = svo('IsURL', isURL, 'uri');
export const IsIP = svo('IsIP', isIP, 'ipv4');
export const IsIPRange = svo('IsIPRange', isIPRange);
export const IsAlpha = svo<IsAlphaOptions>('IsAlpha', (v, p) => isAlpha(v, p?.locale, p));
export const IsAlphanumeric = svo<IsAlphanumericOptions>('IsAlphanumeric', (v, p) =>
  isAlphanumeric(v, p?.locale, p),
);
export const IsNumericString = svo('IsNumericString', isNumeric);
export const IsEmpty = svo('IsEmpty', isEmpty);
export const IsCreditCard = svo('IsCreditCard', isCreditCard);
export const IsCurrency = svo('IsCurrency', isCurrency);
export const IsIBAN = svo('IsIBAN', isIBAN);
export const IsMobilePhone = svr<IsMobilePhoneOptions>('IsMobilePhone', (v, p) =>
  isMobilePhone(v, p.locale, p),
);
export const IsIMEI = svo('IsIMEI', isIMEI);
export const IsFQDN = svo('IsFQDN', isFQDN, 'hostname');
export const IsMACAddress = svo('IsMACAddress', isMACAddress);
export const IsISO8601 = svo('IsISO8601', isISO8601, 'date-time');
export const IsTime = svo('IsTime', isTime, 'time');
export const IsISSN = svo('IsISSN', isISSN);
export const IsStrongPassword = svo<StrongPasswordOptions>('IsStrongPassword', isStrongPassword);
export const IsFloatString = svo('IsFloatString', isFloat);
export const IsIntString = svo('IsIntString', isInt);
export const IsDecimal = svo('IsDecimal', isDecimal);
export const IsByteLength = svo('IsByteLength', isByteLength);

export const IsHash = svr('IsHash', isHash);
export const IsPostalCode = svr('IsPostalCode', isPostalCode);
export const IsVAT = svr('IsVAT', isVAT);
export const IsTaxID = svr('IsTaxID', isTaxID);
export const IsLicensePlate = svr<LicensePlateLocale | 'any'>('IsLicensePlate', isLicensePlate);
export const IsDivisibleBy = svr('IsDivisibleBy', isDivisibleBy);
export const IsWhitelisted = svr('IsWhitelisted', isWhitelisted);
export const IsDateString = svo('IsDateString', isDate);

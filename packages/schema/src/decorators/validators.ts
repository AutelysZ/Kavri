/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * String format validators powered by validator.js.
 * Each composes IsString internally and adds format-specific validation.
 */
import validator from 'validator';
import type {
  StringSchema,
  ValidateOptions,
  SchemaFieldDecorator,
  SchemaFieldDecoratorFactory,
} from '../types.js';
import { createSchemaFieldDecoratorFactory, SchemaField } from '../field.js';
import { IsString } from './primitives.js';

// ---------------------------------------------------------------------------
// Helper: create a string format validator with minimal boilerplate
// ---------------------------------------------------------------------------

function sv<P extends ValidateOptions = ValidateOptions>(
  name: string,
  validateFn: (value: string, params: P) => boolean,
  format?: string,
): SchemaFieldDecoratorFactory<P> {
  const ref: { current?: SchemaFieldDecoratorFactory<P> } = {};
  const factory = createSchemaFieldDecoratorFactory(
    Object.defineProperty(
      function (options?: P, schema?: StringSchema): SchemaFieldDecorator<P> {
        return SchemaField(ref.current as SchemaFieldDecoratorFactory<P>, (options ?? {}) as P, [
          IsString(schema),
        ]);
      },
      'name',
      { value: name },
    ) as SchemaFieldDecoratorFactory<P>,
    {
      validate: (p: P, v: unknown) => typeof v !== 'string' || validateFn(v, p),
      toJsonSchema: format ? () => ({ type: 'string', format }) : undefined,
    },
  );
  ref.current = factory;
  return factory;
}

// ---------------------------------------------------------------------------
// Email / URL / UUID / IP
// ---------------------------------------------------------------------------

/** @see validator.isEmail */
export interface IsEmailOptions extends ValidateOptions {
  allow_display_name?: boolean;
  require_display_name?: boolean;
  allow_utf8_local_part?: boolean;
  require_tld?: boolean;
  allow_ip_domain?: boolean;
  domain_specific_validation?: boolean;
  blacklisted_chars?: string;
  host_blacklist?: string[];
  host_whitelist?: string[];
}

export const IsEmail = sv<IsEmailOptions>('IsEmail', (v, p) => validator.isEmail(v, p), 'email');

/** @see validator.isURL */
export interface IsUrlOptions extends ValidateOptions {
  protocols?: string[];
  require_tld?: boolean;
  require_protocol?: boolean;
  require_host?: boolean;
  require_port?: boolean;
  require_valid_protocol?: boolean;
  allow_underscores?: boolean;
  host_whitelist?: (string | RegExp)[];
  host_blacklist?: (string | RegExp)[];
  allow_trailing_dot?: boolean;
  allow_protocol_relative_urls?: boolean;
  allow_fragments?: boolean;
  allow_query_components?: boolean;
  validate_length?: boolean;
  max_allowed_length?: number;
}

export const IsURL = sv<IsUrlOptions>('IsURL', (v, p) => validator.isURL(v, p), 'uri');

/** @see validator.isUUID */
export interface IsUUIDOptions extends ValidateOptions {
  version?: 1 | 2 | 3 | 4 | 5 | 7 | 'all';
}

export const IsUUID = sv<IsUUIDOptions>('IsUUID', (v, p) => validator.isUUID(v, p.version), 'uuid');

/** @see validator.isIP */
export interface IsIPOptions extends ValidateOptions {
  version?: 4 | 6;
}

export const IsIP = sv<IsIPOptions>('IsIP', (v, p) => validator.isIP(v, p.version), 'ipv4');

/** @see validator.isIPRange */
export const IsIPRange = sv<IsIPOptions>('IsIPRange', (v, p) => validator.isIPRange(v, p.version));

// ---------------------------------------------------------------------------
// String content validators
// ---------------------------------------------------------------------------

/** @see validator.isAlpha */
export interface IsAlphaOptions extends ValidateOptions {
  locale?: validator.AlphaLocale;
  ignore?: string | RegExp;
}

export const IsAlpha = sv<IsAlphaOptions>('IsAlpha', (v, p) =>
  validator.isAlpha(v, p.locale, { ignore: p.ignore }),
);

/** @see validator.isAlphanumeric */
export interface IsAlphanumericOptions extends ValidateOptions {
  locale?: validator.AlphanumericLocale;
  ignore?: string | RegExp;
}

export const IsAlphanumeric = sv<IsAlphanumericOptions>('IsAlphanumeric', (v, p) =>
  validator.isAlphanumeric(v, p.locale, { ignore: p.ignore }),
);

/** @see validator.isNumeric */
export interface IsNumericStringOptions extends ValidateOptions {
  no_symbols?: boolean;
  locale?: validator.FloatLocale;
}

export const IsNumericString = sv<IsNumericStringOptions>('IsNumericString', (v, p) =>
  validator.isNumeric(v, p),
);

export const IsAscii = sv('IsAscii', (v) => validator.isAscii(v));
export const IsMultibyte = sv('IsMultibyte', (v) => validator.isMultibyte(v));
export const IsFullWidth = sv('IsFullWidth', (v) => validator.isFullWidth(v));
export const IsHalfWidth = sv('IsHalfWidth', (v) => validator.isHalfWidth(v));
export const IsVariableWidth = sv('IsVariableWidth', (v) => validator.isVariableWidth(v));
export const IsSurrogatePair = sv('IsSurrogatePair', (v) => validator.isSurrogatePair(v));
export const IsLowercase = sv('IsLowercase', (v) => validator.isLowercase(v));
export const IsUppercase = sv('IsUppercase', (v) => validator.isUppercase(v));
export const IsSlug = sv('IsSlug', (v) => validator.isSlug(v));
export const IsLocale = sv('IsLocale', (v) => validator.isLocale(v));
export const IsEmpty = sv('IsEmpty', (v) => validator.isEmpty(v));

// ---------------------------------------------------------------------------
// Encoding / Format validators
// ---------------------------------------------------------------------------

/** @see validator.isBase32 */
export interface IsBase32Options extends ValidateOptions {
  crockford?: boolean;
}

export const IsBase32 = sv<IsBase32Options>('IsBase32', (v, p) => validator.isBase32(v, p));
export const IsBase58 = sv('IsBase58', (v) => validator.isBase58(v));

/** @see validator.isBase64 */
export interface IsBase64Options extends ValidateOptions {
  urlSafe?: boolean;
}

export const IsBase64 = sv<IsBase64Options>('IsBase64', (v, p) => validator.isBase64(v, p));
export const IsDataURI = sv('IsDataURI', (v) => validator.isDataURI(v));
export const IsMagnetURI = sv('IsMagnetURI', (v) => validator.isMagnetURI(v));
export const IsMailtoURI = sv('IsMailtoURI', (v) => validator.isMailtoURI(v));
export const IsMimeType = sv('IsMimeType', (v) => validator.isMimeType(v));
export const IsJSON = sv('IsJSON', (v) => validator.isJSON(v));
export const IsJWT = sv('IsJWT', (v) => validator.isJWT(v));
export const IsOctal = sv('IsOctal', (v) => validator.isOctal(v));

// ---------------------------------------------------------------------------
// Color validators
// ---------------------------------------------------------------------------

export const IsHexColor = sv('IsHexColor', (v) => validator.isHexColor(v));
export const IsHexadecimal = sv('IsHexadecimal', (v) => validator.isHexadecimal(v));

/** @see validator.isHSL */
export const IsHSL = sv('IsHSL', (v) => validator.isHSL(v));

/** @see validator.isRgbColor */
export interface IsRgbColorOptions extends ValidateOptions {
  includePercentValues?: boolean;
}

export const IsRgbColor = sv<IsRgbColorOptions>('IsRgbColor', (v, p) =>
  validator.isRgbColor(v, p.includePercentValues),
);

// ---------------------------------------------------------------------------
// Hash / Crypto validators
// ---------------------------------------------------------------------------

/** @see validator.isHash */
export interface IsHashOptions extends ValidateOptions {
  algorithm: validator.HashAlgorithm;
}

export const IsHash = sv<IsHashOptions>('IsHash', (v, p) => validator.isHash(v, p.algorithm));
export const IsMD5 = sv('IsMD5', (v) => validator.isMD5(v));

// ---------------------------------------------------------------------------
// Financial validators
// ---------------------------------------------------------------------------

/** @see validator.isCreditCard */
export interface IsCreditCardOptions extends ValidateOptions {
  provider?: 'amex' | 'dinersclub' | 'discover' | 'jcb' | 'mastercard' | 'unionpay' | 'visa';
}

export const IsCreditCard = sv<IsCreditCardOptions>('IsCreditCard', (v, p) =>
  validator.isCreditCard(v, p),
);

/** @see validator.isCurrency */
export interface IsCurrencyOptions extends ValidateOptions {
  symbol?: string;
  require_symbol?: boolean;
  allow_space_after_symbol?: boolean;
  symbol_after_digits?: boolean;
  allow_negatives?: boolean;
  parens_for_negatives?: boolean;
  negative_sign_before_digits?: boolean;
  negative_sign_after_digits?: boolean;
  allow_negative_sign_placeholder?: boolean;
  thousands_separator?: string;
  decimal_separator?: string;
  allow_decimal?: boolean;
  require_decimal?: boolean;
  digits_after_decimal?: number[];
  allow_space_after_digits?: boolean;
}

export const IsCurrency = sv<IsCurrencyOptions>('IsCurrency', (v, p) => validator.isCurrency(v, p));

export const IsEAN = sv('IsEAN', (v) => validator.isEAN(v));
export const IsISIN = sv('IsISIN', (v) => validator.isISIN(v));

/** @see validator.isISBN */
export interface IsISBNOptions extends ValidateOptions {
  version?: 10 | 13;
}

export const IsISBN = sv<IsISBNOptions>('IsISBN', (v, p) => validator.isISBN(v, p.version));
export const IsEthereumAddress = sv('IsEthereumAddress', (v) => validator.isEthereumAddress(v));
export const IsBtcAddress = sv('IsBtcAddress', (v) => validator.isBtcAddress(v));

/** @see validator.isIBAN */
export interface IsIBANOptions extends ValidateOptions {
  whitelist?: readonly string[];
  blacklist?: string[];
}

export const IsIBAN = sv<IsIBANOptions>('IsIBAN', (v, p) => validator.isIBAN(v, p as any));
export const IsBIC = sv('IsBIC', (v) => validator.isBIC(v));
export const IsAbaRouting = sv('IsAbaRouting', (v) => validator.isAbaRouting(v));

/** @see validator.isVAT */
export interface IsVATOptions extends ValidateOptions {
  countryCode: string;
}

export const IsVAT = sv<IsVATOptions>('IsVAT', (v, p) => validator.isVAT(v, p.countryCode as any));

/** @see validator.isTaxID */
export interface IsTaxIDOptions extends ValidateOptions {
  locale: string;
}

export const IsTaxID = sv<IsTaxIDOptions>('IsTaxID', (v, p) => validator.isTaxID(v, p.locale));
export const IsLuhnNumber = sv('IsLuhnNumber', (v) => validator.isLuhnNumber(v));

// ---------------------------------------------------------------------------
// Phone / Identity validators
// ---------------------------------------------------------------------------

/** @see validator.isMobilePhone */
export interface IsMobilePhoneOptions extends ValidateOptions {
  locale?: validator.MobilePhoneLocale | validator.MobilePhoneLocale[];
  strictMode?: boolean;
}

export const IsMobilePhone = sv<IsMobilePhoneOptions>('IsMobilePhone', (v, p) =>
  validator.isMobilePhone(v, p.locale, { strictMode: p.strictMode }),
);

/** @see validator.isPassportNumber */
export interface IsPassportNumberOptions extends ValidateOptions {
  countryCode?: string;
}

export const IsPassportNumber = sv<IsPassportNumberOptions>('IsPassportNumber', (v, p) =>
  validator.isPassportNumber(v, p.countryCode),
);

/** @see validator.isIdentityCard */
export interface IsIdentityCardOptions extends ValidateOptions {
  locale?: validator.IdentityCardLocale;
}

export const IsIdentityCard = sv<IsIdentityCardOptions>('IsIdentityCard', (v, p) =>
  validator.isIdentityCard(v, p.locale),
);

/** @see validator.isIMEI */
export interface IsIMEIOptions extends ValidateOptions {
  allow_hyphens?: boolean;
}

export const IsIMEI = sv<IsIMEIOptions>('IsIMEI', (v, p) => validator.isIMEI(v, p));

/** @see validator.isLicensePlate */
export interface IsLicensePlateOptions extends ValidateOptions {
  locale: string;
}

export const IsLicensePlate = sv<IsLicensePlateOptions>(
  'IsLicensePlate',
  (v, p) => !!validator.isLicensePlate(v, p.locale),
);

// ---------------------------------------------------------------------------
// Network / Domain validators
// ---------------------------------------------------------------------------

/** @see validator.isFQDN */
export interface IsFQDNOptions extends ValidateOptions {
  require_tld?: boolean;
  allow_underscores?: boolean;
  allow_trailing_dot?: boolean;
  allow_numeric_tld?: boolean;
  allow_wildcard?: boolean;
  ignore_max_length?: boolean;
}

export const IsFQDN = sv<IsFQDNOptions>('IsFQDN', (v, p) => validator.isFQDN(v, p), 'hostname');

/** @see validator.isMACAddress */
export interface IsMACAddressOptions extends ValidateOptions {
  no_separators?: boolean;
  no_colons?: boolean;
  eui?: '48' | '64';
}

export const IsMACAddress = sv<IsMACAddressOptions>('IsMACAddress', (v, p) =>
  validator.isMACAddress(v, p),
);

export const IsPort = sv('IsPort', (v) => validator.isPort(v));
export const IsMongoId = sv('IsMongoId', (v) => validator.isMongoId(v));

// ---------------------------------------------------------------------------
// Geo / Postal validators
// ---------------------------------------------------------------------------

export const IsLatLong = sv('IsLatLong', (v) => validator.isLatLong(v));

/** @see validator.isPostalCode */
export interface IsPostalCodeOptions extends ValidateOptions {
  locale: validator.PostalCodeLocale;
}

export const IsPostalCode = sv<IsPostalCodeOptions>('IsPostalCode', (v, p) =>
  validator.isPostalCode(v, p.locale),
);

// ---------------------------------------------------------------------------
// Date / Time format validators
// ---------------------------------------------------------------------------

/** @see validator.isISO8601 */
export interface IsISO8601Options extends ValidateOptions {
  strict?: boolean;
  strictSeparator?: boolean;
}

export const IsISO8601 = sv<IsISO8601Options>(
  'IsISO8601',
  (v, p) => validator.isISO8601(v, p),
  'date-time',
);

export const IsRFC3339 = sv('IsRFC3339', (v) => validator.isRFC3339(v), 'date-time');

/** @see validator.isTime */
export interface IsTimeOptions extends ValidateOptions {
  hourFormat?: 'hour24' | 'hour12';
  mode?: 'default' | 'withSeconds';
}

export const IsTime = sv<IsTimeOptions>('IsTime', (v, p) => validator.isTime(v, p), 'time');

// ---------------------------------------------------------------------------
// ISO / Standard validators
// ---------------------------------------------------------------------------

export const IsISO4217 = sv('IsISO4217', (v) => validator.isISO4217(v));
export const IsISO6346 = sv('IsISO6346', (v) => validator.isISO6346(v));
export const IsISO6391 = sv('IsISO6391', (v) => validator.isISO6391(v));
export const IsISO15924 = sv('IsISO15924', (v) => validator.isISO15924(v));
export const IsISO31661Alpha2 = sv('IsISO31661Alpha2', (v) => validator.isISO31661Alpha2(v));
export const IsISO31661Alpha3 = sv('IsISO31661Alpha3', (v) => validator.isISO31661Alpha3(v));
export const IsISO31661Numeric = sv('IsISO31661Numeric', (v) => validator.isISO31661Numeric(v));
export const IsISRC = sv('IsISRC', (v) => validator.isISRC(v));

/** @see validator.isISSN */
export interface IsISSNOptions extends ValidateOptions {
  case_sensitive?: boolean;
  require_hyphen?: boolean;
}

export const IsISSN = sv<IsISSNOptions>('IsISSN', (v, p) => validator.isISSN(v, p));
export const IsFreightContainerID = sv('IsFreightContainerID', (v) =>
  validator.isFreightContainerID(v),
);
export const IsULID = sv('IsULID', (v) => validator.isULID(v));

// ---------------------------------------------------------------------------
// Misc validators
// ---------------------------------------------------------------------------

export const IsSemVer = sv('IsSemVer', (v) => validator.isSemVer(v));

/** @see validator.isStrongPassword */
export interface IsStrongPasswordOptions extends ValidateOptions {
  minLength?: number;
  minLowercase?: number;
  minUppercase?: number;
  minNumbers?: number;
  minSymbols?: number;
  returnScore?: boolean;
  pointsPerUnique?: number;
  pointsPerRepeat?: number;
  pointsForContainingLower?: number;
  pointsForContainingUpper?: number;
  pointsForContainingNumber?: number;
  pointsForContainingSymbol?: number;
}

export const IsStrongPassword = sv<IsStrongPasswordOptions>(
  'IsStrongPassword',
  (v, p) => !!validator.isStrongPassword(v, p),
);

/** @see validator.isFloat */
export interface IsFloatOptions extends ValidateOptions {
  min?: number;
  max?: number;
  gt?: number;
  lt?: number;
  locale?: validator.FloatLocale;
}

export const IsFloatString = sv<IsFloatOptions>('IsFloatString', (v, p) => validator.isFloat(v, p));

/** @see validator.isInt */
export interface IsIntStringOptions extends ValidateOptions {
  min?: number;
  max?: number;
  allow_leading_zeroes?: boolean;
  lt?: number;
  gt?: number;
}

export const IsIntString = sv<IsIntStringOptions>('IsIntString', (v, p) => validator.isInt(v, p));

/** @see validator.isDecimal */
export interface IsDecimalOptions extends ValidateOptions {
  force_decimal?: boolean;
  decimal_digits?: string;
  locale?: validator.DecimalLocale;
}

export const IsDecimal = sv<IsDecimalOptions>('IsDecimal', (v, p) => validator.isDecimal(v, p));

/** @see validator.isDivisibleBy */
export interface IsDivisibleByOptions extends ValidateOptions {
  divisor: number;
}

export const IsDivisibleBy = sv<IsDivisibleByOptions>('IsDivisibleBy', (v, p) =>
  validator.isDivisibleBy(v, p.divisor),
);

/** @see validator.isByteLength */
export interface IsByteLengthOptions extends ValidateOptions {
  min?: number;
  max?: number;
}

export const IsByteLength = sv<IsByteLengthOptions>('IsByteLength', (v, p) =>
  validator.isByteLength(v, p),
);

/** @see validator.isWhitelisted */
export interface IsWhitelistedOptions extends ValidateOptions {
  chars: string | string[];
}

export const IsWhitelisted = sv<IsWhitelistedOptions>('IsWhitelisted', (v, p) =>
  validator.isWhitelisted(v, p.chars),
);

/** @see validator.isAfter */
export interface IsAfterOptions extends ValidateOptions {
  date?: string;
}

export const IsAfter = sv<IsAfterOptions>('IsAfter', (v, p) => validator.isAfter(v, p.date));

/** @see validator.isBefore */
export interface IsBeforeOptions extends ValidateOptions {
  date?: string;
}

export const IsBefore = sv<IsBeforeOptions>('IsBefore', (v, p) => validator.isBefore(v, p.date));

/** @see validator.isDate */
export interface IsDateStringOptions extends ValidateOptions {
  format?: string;
  strictMode?: boolean;
  delimiters?: string[];
}

export const IsDateString = sv<IsDateStringOptions>('IsDateString', (v, p) =>
  validator.isDate(v, p),
);

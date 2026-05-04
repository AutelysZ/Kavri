import type { AnyConstructor } from '@kavri/basic';
import type { OpenAPIv3Operation } from './openapi.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

export interface SharedOptions {
  /**
   * OpenAPI summary
   */
  summary?: string;
  /**
   * OpenAPI description
   */
  description?: string;
  /**
   * Deprecated must say why and alternative solution.
   */
  deprecated?: string;
  /**
   * Max body size
   */
  maxBodySize?: number;
  /**
   * Response content type, default is computed with:
   * - response with {@link FileUnion} or {@link BinaryUnion}: application/octet-stream
   * - null response: none
   * - any response with field that has {@link FileUnion}: multipart/form-data
   * - any other: this field or application/json
   */
  responseType?: string;
  /**
   * Request content type, compute rule is same as {@link responseType}.
   */
  requestType?: string;
}

export interface OperationOptions
  extends Partial<Omit<OpenAPIv3Operation, 'deprecated' | 'operationId'>>, SharedOptions {
  /**
   * The operation's path suffix, like `/create`, it's optional, if not present, will use
   * operation's name as this field. If you want empty path, use ''.
   */
  path?: string;
  /**
   * kavri introduced field to indicate the operation's idempotency
   * - safe: get data
   * - idempotent: manipulate data idempotently
   * - volatile: non-idempotent data operation
   */
  idempotency?: 'safe' | 'idempotent' | 'volatile';
  /**
   * OK response status, default is computed with:
   * - any method without response: 204
   * - post method with response: 201
   * - any other: 200
   */
  status?: number;
}

export interface Operation<TReq = unknown, TRes = unknown> extends OperationOptions {
  method: HttpMethod;
  request: AnyConstructor<TReq> | null;
  response: AnyConstructor<TRes> | null;
}

export interface RouteDefinition<
  T extends Record<string, Operation> = Record<string, Operation>,
> extends SharedOptions {
  /**
   * The route name, like `UserRoute`, `UserController`, depends on user habits. It will be added to OpenAPI's tags
   */
  name: string;

  /**
   * Path prefix of route, like `/user`, `users`, etc.
   */
  path: string;

  /**
   * The operations, the key will be the operationId, and will be the default path of the operation,
   * see {@link OperationOptions.path}.
   */
  operations: T;
}

function operation<TReq, TRes>(
  method: HttpMethod,
  request: AnyConstructor<TReq> | null,
  response: AnyConstructor<TRes> | null,
  pathOrOptions?: string | OperationOptions,
  options?: OperationOptions,
): Operation<TReq, TRes> {
  const opts: OperationOptions =
    typeof pathOrOptions === 'string'
      ? { ...options, path: pathOrOptions }
      : { ...options, ...pathOrOptions };
  return {
    ...opts,
    method,
    request,
    response,
  };
}

/**
 * Create an operation with specified configurations.
 *
 * For req/res, use any class that decorated with @{@link Schema}. Special values:
 *
 * - `null`: means no request or no response
 * - {@link FileUnion} or {@link BinaryUnion}: if as root, means the req/res is octet-stream,
 *    if any field of the req/res use these two, will force change the content type to multipart.
 *
 * Ref: {@link SharedOptions.requestType}, {@link SharedOptions.responseType}
 */
export interface OperationBuilder {
  <TReq, TRes>(
    req: AnyConstructor<TReq> | null,
    res: AnyConstructor<TRes> | null,
    path: string,
    options?: OperationOptions,
  ): Operation<TReq, TRes>;
  <TReq, TRes>(
    req: AnyConstructor<TReq> | null,
    res: AnyConstructor<TRes> | null,
    options?: OperationOptions,
  ): Operation<TReq, TRes>;
}

function makeOperation(method: HttpMethod): OperationBuilder {
  return ((req, res, pathOrOptions, options) =>
    operation(method, req, res, pathOrOptions, options)) as OperationBuilder;
}

export const get = makeOperation('GET');
export const post = makeOperation('POST');
export const put = makeOperation('PUT');
export const del = makeOperation('DELETE');
export const head = makeOperation('HEAD');
export const patch = makeOperation('PATCH');

export function defineRoute<T extends Record<string, Operation>>(
  def: RouteDefinition<T>,
): RouteDefinition<T> {
  return def;
}

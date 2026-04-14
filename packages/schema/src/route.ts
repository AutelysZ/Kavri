/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Route and WebSocket protocol definitions.
 * Pure data structures — no validation logic.
 */
import type { AnyConstructor } from '@kavri/basic';

// ---------------------------------------------------------------------------
// HTTP Route types
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

export type RequestInput<T> = AnyConstructor<T> | 'void';
export type ResponseOutput<T> = AnyConstructor<T> | 'void' | 'stream';

export interface EndpointOptions {
  path?: string;
  title?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  externalDocs?: { url: string; description?: string };
  idempotency?: 'safe' | 'idempotent' | 'volatile';
  requestType?: 'data' | 'multipart' | 'binary';
  multipart?: { maxFileSize: number; maxBodySize: number; accept?: string[] };
  binary?: { maxBodySize: number };
}

export interface Endpoint<TReq = any, TRes = any> {
  method: HttpMethod;
  path: string;
  request: RequestInput<TReq>;
  response: ResponseOutput<TRes>;
  options: EndpointOptions;
}

export interface RouteOptions {
  base: string;
  title?: string;
  description?: string;
}

export interface RouteDefinition<T extends Record<string, Endpoint> = Record<string, Endpoint>> {
  readonly name: string;
  readonly base: string;
  readonly options: RouteOptions;
  readonly endpoints: T;
}

// ---------------------------------------------------------------------------
// HTTP method helpers
// ---------------------------------------------------------------------------

function endpoint<TReq, TRes>(
  method: HttpMethod,
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  const opts: EndpointOptions =
    typeof pathOrOptions === 'string'
      ? { ...options, path: pathOrOptions }
      : { ...options, ...pathOrOptions };
  return {
    method,
    path: opts.path ?? '',
    request,
    response,
    options: opts,
  };
}

export function get<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('GET', request, response, pathOrOptions, options);
}

export function post<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('POST', request, response, pathOrOptions, options);
}

export function put<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('PUT', request, response, pathOrOptions, options);
}

export function del<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('DELETE', request, response, pathOrOptions, options);
}

export function patch<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('PATCH', request, response, pathOrOptions, options);
}

export function head<TReq, TRes>(
  request: RequestInput<TReq>,
  response: ResponseOutput<TRes>,
  pathOrOptions?: string | EndpointOptions,
  options?: EndpointOptions,
): Endpoint<TReq, TRes> {
  return endpoint('HEAD', request, response, pathOrOptions, options);
}

// ---------------------------------------------------------------------------
// defineRoute
// ---------------------------------------------------------------------------

export function defineRoute<T extends Record<string, Endpoint>>(
  name: string,
  baseOrOptions: string | RouteOptions,
  endpoints: T,
): RouteDefinition<T> {
  const options: RouteOptions =
    typeof baseOrOptions === 'string' ? { base: baseOrOptions } : baseOrOptions;
  return {
    name,
    base: options.base,
    options,
    endpoints,
  };
}

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------

export type MessageType = AnyConstructor<any> | 'binary';

export interface WebSocketOptions {
  path: string;
  request?: AnyConstructor<any>;
  title?: string;
  description?: string;
  codec?: string;
}

export interface WebSocketProtocol<
  TIn extends Record<string, MessageType> = Record<string, MessageType>,
  TOut extends Record<string, MessageType> = Record<string, MessageType>,
> {
  readonly name: string;
  readonly path: string;
  readonly options: WebSocketOptions;
  readonly inbound: TIn;
  readonly outbound: TOut;
}

export function defineWebSocket<
  TIn extends Record<string, MessageType>,
  TOut extends Record<string, MessageType>,
>(
  name: string,
  pathOrOptions: string | WebSocketOptions,
  messages: { inbound: TIn; outbound: TOut },
): WebSocketProtocol<TIn, TOut> {
  const options: WebSocketOptions =
    typeof pathOrOptions === 'string' ? { path: pathOrOptions } : pathOrOptions;
  return {
    name,
    path: options.path,
    options,
    inbound: messages.inbound,
    outbound: messages.outbound,
  };
}

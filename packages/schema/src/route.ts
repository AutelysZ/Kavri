/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Route and WebSocket protocol definitions.
 * Pure data structures — no validation logic.
 */
import type { AnyConstructor } from '@kavri/basic';
import type { JsonSchema } from './types.js';
import { toJsonSchema } from './schema.js';

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

// ---------------------------------------------------------------------------
// OpenAPI 3.1 types
// ---------------------------------------------------------------------------

export interface OpenAPIv3Info {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string; identifier?: string };
  summary?: string;
}

export interface OpenAPIv3Server {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface OpenAPIv3ExternalDocs {
  url: string;
  description?: string;
}

export interface OpenAPIv3Reference {
  $ref: string;
  summary?: string;
  description?: string;
}

export interface OpenAPIv3MediaType {
  schema?: JsonSchema | OpenAPIv3Reference;
  example?: unknown;
  examples?: Record<
    string,
    { value?: unknown; summary?: string; description?: string } | OpenAPIv3Reference
  >;
  encoding?: Record<string, { contentType?: string; style?: string; explode?: boolean }>;
}

export interface OpenAPIv3Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: JsonSchema | OpenAPIv3Reference;
  example?: unknown;
  style?: string;
  explode?: boolean;
}

export interface OpenAPIv3RequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenAPIv3MediaType>;
}

export interface OpenAPIv3Response {
  description: string;
  headers?: Record<string, { description?: string; schema?: JsonSchema | OpenAPIv3Reference }>;
  content?: Record<string, OpenAPIv3MediaType>;
}

export interface OpenAPIv3Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  externalDocs?: OpenAPIv3ExternalDocs;
  parameters?: (OpenAPIv3Parameter | OpenAPIv3Reference)[];
  requestBody?: OpenAPIv3RequestBody | OpenAPIv3Reference;
  responses: Record<string, OpenAPIv3Response | OpenAPIv3Reference>;
}

export interface OpenAPIv3PathItem {
  summary?: string;
  description?: string;
  get?: OpenAPIv3Operation;
  put?: OpenAPIv3Operation;
  post?: OpenAPIv3Operation;
  delete?: OpenAPIv3Operation;
  patch?: OpenAPIv3Operation;
  head?: OpenAPIv3Operation;
}

export interface OpenAPIv3 {
  openapi: '3.1.0';
  info: OpenAPIv3Info;
  servers?: OpenAPIv3Server[];
  paths: Record<string, OpenAPIv3PathItem>;
  components?: {
    schemas?: Record<string, JsonSchema>;
  };
}

// ---------------------------------------------------------------------------
// OpenAPI generation
// ---------------------------------------------------------------------------

export interface ToOpenAPIOptions {
  title?: string;
  version?: string;
  description?: string;
  server?: string | string[];
  prefix?: string;
}

/**
 * Build the JSON Schema for a request/response type.
 * Returns undefined for 'void' and 'stream'.
 */
function buildSchema(
  input: RequestInput<any> | ResponseOutput<any>,
  schemas: Record<string, JsonSchema>,
): JsonSchema | OpenAPIv3Reference | undefined {
  if (input === 'void' || input === 'stream') return undefined;
  const ctor = input as AnyConstructor;
  const name = ctor.name;
  if (!schemas[name]) {
    schemas[name] = toJsonSchema(ctor);
  }
  return { $ref: `#/components/schemas/${name}` };
}

/**
 * Determine the content type for a request.
 */
function requestContentType(ep: Endpoint): string {
  switch (ep.options.requestType) {
    case 'multipart':
      return 'multipart/form-data';
    case 'binary':
      return 'application/octet-stream';
    default:
      return 'application/json';
  }
}

/**
 * Generate an OpenAPI 3.1 document from route definitions.
 *
 * Merges multiple route definitions into a single spec. Each route's
 * endpoints are mapped to OpenAPI path items with JSON Schema derived
 * from the request/response classes via `toJsonSchema`.
 *
 * @param routes - Route definitions to include.
 * @param options - Top-level OpenAPI metadata.
 * @returns A complete OpenAPI 3.1 document.
 *
 * @example
 * ```ts
 * const spec = toOpenAPIv3([userRoute, orderRoute], {
 *   title: 'My API',
 *   version: '1.0.0',
 * });
 * ```
 */
export function toOpenAPIv3(
  routes: readonly RouteDefinition<any>[],
  options?: ToOpenAPIOptions,
): OpenAPIv3 {
  const schemas: Record<string, JsonSchema> = {};
  const paths: Record<string, OpenAPIv3PathItem> = {};

  for (const route of routes) {
    const routePrefix = (options?.prefix ?? '') + route.base;

    for (const [name, ep] of Object.entries(route.endpoints) as [string, Endpoint][]) {
      const fullPath = routePrefix + (ep.path || `/${name}`);
      const method = ep.method.toLowerCase() as keyof OpenAPIv3PathItem;

      const operation: OpenAPIv3Operation = {
        operationId: name,
        responses: {},
      };

      if (ep.options.title) operation.summary = ep.options.title;
      if (ep.options.description) operation.description = ep.options.description;
      if (ep.options.tags) operation.tags = ep.options.tags;
      if (ep.options.deprecated) operation.deprecated = true;
      if (ep.options.externalDocs) operation.externalDocs = ep.options.externalDocs;

      // Request body
      const reqSchema = buildSchema(ep.request, schemas);
      if (reqSchema) {
        operation.requestBody = {
          required: true,
          content: {
            [requestContentType(ep)]: { schema: reqSchema },
          },
        };
      }

      // Response
      const resSchema = buildSchema(ep.response, schemas);
      if (resSchema) {
        operation.responses['200'] = {
          description: 'Successful response',
          content: {
            [ep.response === 'stream' ? 'application/octet-stream' : 'application/json']: {
              schema: resSchema,
            },
          },
        };
      } else if (ep.response === 'stream') {
        operation.responses['200'] = {
          description: 'Streaming response',
          content: {
            'application/octet-stream': {},
          },
        };
      } else {
        operation.responses['204'] = { description: 'No content' };
      }

      if (!paths[fullPath]) paths[fullPath] = {};
      (paths[fullPath] as any)[method] = operation;
    }
  }

  const servers: OpenAPIv3Server[] | undefined = options?.server
    ? Array.isArray(options.server)
      ? options.server.map((url) => ({ url }))
      : [{ url: options.server }]
    : undefined;

  const doc: OpenAPIv3 = {
    openapi: '3.1.0',
    info: {
      title: options?.title ?? 'API',
      version: options?.version ?? '0.0.0',
    },
    paths,
  };

  if (servers) doc.servers = servers;
  if (Object.keys(schemas).length > 0) {
    doc.components = { schemas };
  }

  return doc;
}

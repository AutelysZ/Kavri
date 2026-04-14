/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenAPI 3.1 types and generation from route definitions.
 */
import type { AnyConstructor } from '@kavri/basic';
import type { JsonSchema } from './types.js';
import { toJsonSchema } from './schema.js';
import type { Endpoint, RequestInput, ResponseOutput, RouteDefinition } from './route.js';

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
  security?: Record<string, string[]>[];
  tags?: { name: string; description?: string; externalDocs?: OpenAPIv3ExternalDocs }[];
  externalDocs?: OpenAPIv3ExternalDocs;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for `toOpenAPIv3`. All top-level OpenAPI fields can be set directly.
 *
 * Shorthand `server` (string or string[]) is expanded into `servers`.
 * `prefix` is prepended to every route path.
 */
export interface ToOpenAPIOptions extends Partial<Omit<OpenAPIv3, 'openapi' | 'paths'>> {
  /**
   * Shorthand for `servers`. A single URL or array of URLs.
   * If both `server` and `servers` are provided, `servers` takes precedence.
   */
  server?: string | string[];
  /**
   * Prefix prepended to all route paths (e.g., `/api/v1`).
   */
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// toOpenAPIv3
// ---------------------------------------------------------------------------

/**
 * Generate an OpenAPI 3.1 document from route definitions.
 *
 * Merges multiple route definitions into a single spec. Each route's
 * endpoints are mapped to OpenAPI path items with JSON Schema derived
 * from the request/response classes via `toJsonSchema`.
 *
 * @param routes - Route definitions to include.
 * @param options - Top-level OpenAPI fields and generation options.
 *   Supports all `OpenAPIv3` fields (info, servers, tags, security, etc.)
 *   plus `server` shorthand and `prefix`.
 * @returns A complete OpenAPI 3.1 document.
 *
 * @example
 * ```ts
 * const spec = toOpenAPIv3([userRoute, orderRoute], {
 *   info: { title: 'My API', version: '1.0.0' },
 *   servers: [{ url: 'https://api.example.com' }],
 *   prefix: '/api/v1',
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

  // Resolve servers: explicit servers > server shorthand > undefined
  const servers: OpenAPIv3Server[] | undefined =
    options?.servers ??
    (options?.server
      ? Array.isArray(options.server)
        ? options.server.map((url) => ({ url }))
        : [{ url: options.server }]
      : undefined);

  // Merge generated schemas with any user-provided component schemas
  const componentSchemas = {
    ...schemas,
    ...options?.components?.schemas,
  };

  const doc: OpenAPIv3 = {
    openapi: '3.1.0',
    info: options?.info ?? { title: 'API', version: '0.0.0' },
    paths,
  };

  if (servers) doc.servers = servers;
  if (Object.keys(componentSchemas).length > 0) {
    doc.components = { ...options?.components, schemas: componentSchemas };
  } else if (options?.components) {
    doc.components = options.components;
  }
  if (options?.security) doc.security = options.security;
  if (options?.tags) doc.tags = options.tags;
  if (options?.externalDocs) doc.externalDocs = options.externalDocs;

  return doc;
}

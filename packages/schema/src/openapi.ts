import { type JsonSchema, toJsonSchema } from './jsonschema.js';
import type { HttpMethod, Operation, RouteDefinition } from './route.js';

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
// toOpenAPIv3
// ---------------------------------------------------------------------------

const HTTP_METHOD_BUCKETS = {
  GET: 'get',
  PUT: 'put',
  POST: 'post',
  DELETE: 'delete',
  PATCH: 'patch',
  HEAD: 'head',
} as const satisfies Record<HttpMethod, keyof OpenAPIv3PathItem>;

/**
 * Build an OpenAPI 3.1.0 spec from `defineRoute(...)` definitions.
 *
 * Per-route handling:
 * - `name` becomes a top-level `tag` and is attached to every operation in
 *   that route.
 * - `path` is the operation path prefix; each operation's effective path is
 *   `joinPath(route.path, op.path ?? '/' + opName)`.
 * - Path parameters (`{name}` segments) are extracted into `operation.parameters`.
 *
 * Per-operation handling:
 * - `request` (a `@Schema` class) → `requestBody.content[contentType].schema`
 *   via `toJsonSchema`. Skipped when `request === null`.
 * - `response` → `responses[status].content[contentType].schema`. Status
 *   defaults: no response → `204`; `POST` with response → `201`; otherwise
 *   `200`. Operation `status` overrides this.
 * - `summary` / `description` flow through; `deprecated` (a string) flips the
 *   OpenAPI boolean (the why-string is preserved by appending it to the
 *   description if no description was set).
 *
 * `extra` is shallow-merged into the result so callers can supply
 * `info`, `servers`, `security`, `externalDocs`, etc. without re-implementing
 * the whole spec.
 */
export function toOpenAPIv3(
  routes: readonly RouteDefinition[],
  extra?: Partial<OpenAPIv3>,
): OpenAPIv3 {
  const paths: Record<string, OpenAPIv3PathItem> = {};
  const tags: NonNullable<OpenAPIv3['tags']> = [];
  const seenTags = new Set<string>();

  for (const route of routes) {
    if (route.name && !seenTags.has(route.name)) {
      seenTags.add(route.name);
      const tag: NonNullable<OpenAPIv3['tags']>[number] = { name: route.name };
      if (route.description) tag.description = route.description;
      tags.push(tag);
    }

    for (const [opName, op] of Object.entries(route.operations)) {
      const fullPath = joinPath(route.path, op.path ?? '/' + opName);
      const item = (paths[fullPath] ??= {});
      const bucket = HTTP_METHOD_BUCKETS[op.method];
      item[bucket] = buildOperation(opName, op, route, fullPath);
    }
  }

  const out: OpenAPIv3 = {
    openapi: '3.1.0',
    info: extra?.info ?? { title: 'API', version: '0.0.0' },
    paths,
  };
  if (tags.length > 0) out.tags = tags;
  if (extra) {
    if (extra.servers) out.servers = extra.servers;
    if (extra.components) out.components = extra.components;
    if (extra.security) out.security = extra.security;
    if (extra.externalDocs) out.externalDocs = extra.externalDocs;
    if (extra.tags) out.tags = [...(out.tags ?? []), ...extra.tags];
  }
  return out;
}

function buildOperation(
  opName: string,
  op: Operation,
  route: RouteDefinition,
  fullPath: string,
): OpenAPIv3Operation {
  const operation: OpenAPIv3Operation = {
    operationId: opName,
    responses: buildResponses(op),
  };
  if (route.name) operation.tags = [route.name];
  if (op.summary) operation.summary = op.summary;
  if (op.description || op.deprecated) {
    operation.description = combineDescription(op.description, op.deprecated);
  }
  if (op.deprecated) operation.deprecated = true;
  if (op.externalDocs) operation.externalDocs = op.externalDocs;

  const pathParams = extractPathParameters(fullPath);
  if (pathParams.length > 0 || op.parameters) {
    operation.parameters = [...(op.parameters ?? []), ...pathParams];
  }

  if (op.request) {
    operation.requestBody = {
      required: true,
      content: {
        [op.requestType ?? 'application/json']: {
          schema: toJsonSchema(op.request),
        },
      },
    };
  }
  return operation;
}

function buildResponses(op: Operation): Record<string, OpenAPIv3Response> {
  const status = defaultStatus(op);
  const response: OpenAPIv3Response = {
    description: op.summary ?? '',
  };
  if (op.response) {
    response.content = {
      [op.responseType ?? 'application/json']: {
        schema: toJsonSchema(op.response),
      },
    };
  }
  return { [String(status)]: response };
}

function defaultStatus(op: Operation): number {
  if (op.status !== undefined) return op.status;
  if (!op.response) return 204;
  if (op.method === 'POST') return 201;
  return 200;
}

function combineDescription(description?: string, deprecated?: string): string {
  if (!deprecated) return description ?? '';
  if (!description) return `[Deprecated] ${deprecated}`;
  return `${description}\n\n[Deprecated] ${deprecated}`;
}

const PATH_PARAM_RE = /\{([^}]+)\}/g;

function extractPathParameters(path: string): OpenAPIv3Parameter[] {
  const out: OpenAPIv3Parameter[] = [];
  for (const match of path.matchAll(PATH_PARAM_RE)) {
    out.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }
  return out;
}

function joinPath(prefix: string, suffix: string): string {
  const a = prefix.startsWith('/') ? prefix : '/' + prefix;
  const b = suffix.startsWith('/') ? suffix : '/' + suffix;
  // Collapse duplicate slashes and trim trailing one (except for the root path).
  const joined = (a + b).replace(/\/+/g, '/').replace(/\/$/, '');
  return joined === '' ? '/' : joined;
}

// ---------------------------------------------------------------------------
// fromOpenAPIv3
// ---------------------------------------------------------------------------

type MethodBucket = 'get' | 'put' | 'post' | 'delete' | 'patch' | 'head';

const HTTP_METHOD_FROM_BUCKET = {
  get: 'GET',
  put: 'PUT',
  post: 'POST',
  delete: 'DELETE',
  patch: 'PATCH',
  head: 'HEAD',
} as const satisfies Record<MethodBucket, HttpMethod>;

/**
 * Reverse `toOpenAPIv3` *as far as the data model allows*. The OpenAPI spec
 * doesn't carry the `@Schema` class identities used by `RouteDefinition`, so
 * `request` and `response` come back as `null`; callers needing real classes
 * have to hydrate them separately. The resulting RouteDefinitions are grouped
 * by the first tag on each operation (operations with no tag end up under
 * `name: ''`).
 */
export function fromOpenAPIv3(spec: OpenAPIv3): RouteDefinition[] {
  const byTag = new Map<string, RouteDefinition<Record<string, Operation>>>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [bucket, method] of Object.entries(HTTP_METHOD_FROM_BUCKET) as [
      MethodBucket,
      HttpMethod,
    ][]) {
      const op = item[bucket];
      if (!op) continue;
      const tagName = op.tags?.[0] ?? '';
      let route = byTag.get(tagName);
      if (!route) {
        route = { name: tagName, path: '', operations: {} };
        byTag.set(tagName, route);
      }
      const opName = op.operationId ?? `${bucket}${path.replace(/\W+/g, '_')}`;
      const operation: Operation = {
        method,
        request: null,
        response: null,
        path,
      };
      if (op.summary) operation.summary = op.summary;
      if (op.description) operation.description = op.description;
      if (op.deprecated) operation.deprecated = '';
      const status = firstStatusKey(op.responses);
      if (status !== undefined) operation.status = status;
      route.operations[opName] = operation;
    }
  }
  return [...byTag.values()];
}

function firstStatusKey(
  responses: OpenAPIv3Operation['responses'],
): number | undefined {
  for (const key of Object.keys(responses ?? {})) {
    const n = Number(key);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

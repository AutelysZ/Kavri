import { type AnyConstructor, type FieldDecorator, Metadata } from '@kavri/basic';
import { IsOptional } from './decorators/base.js';
import { Ref } from './decorators/object.js';
import {
  InHeader,
  InQuery,
  IsFile,
  RawBody,
} from './decorators/route.js';
import {
  FieldSchema,
  type FieldSchemaDecorator,
  type FieldSchemaDecoratorMetadata,
  type NestedFieldSchema,
} from './field.js';
import { fromJsonSchema, type JsonSchema, toJsonSchema } from './jsonschema.js';
import type { HttpMethod, Operation, RouteDefinition } from './route.js';
import { entryOf } from './utils.js';

// ---------------------------------------------------------------------------
// OpenAPI 3.1 type definitions
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
 * Per-route: `name` becomes a top-level tag (deduped) and is attached to every
 * operation as the operation tag; `path` is the operation prefix.
 *
 * Per-operation:
 * - The effective path is `joinPath(route.path, op.path ?? '/' + opName)`;
 *   `{name}` segments in the resulting path are auto-extracted into
 *   `path` parameters.
 * - The request class is split by field-level placement decorators:
 *   `@InQuery` / `@InHeader` fields become `operation.parameters`;
 *   `@RawBody` fields take over the entire body (default content type
 *   `application/octet-stream`); `@IsFile` fields force `multipart/form-data`;
 *   remaining fields become properties of an `application/json` body object
 *   (or whatever `op.requestType` overrides). Per-field `@IsOptional` flips
 *   `required` (parameter-level) or excludes the key from the body object's
 *   `required` array.
 * - The response class is serialised into the chosen status' content via
 *   `toJsonSchema(class)`. Status defaults: no response → `204`; `POST` with
 *   response → `201`; otherwise → `200`. `op.status` overrides.
 *
 * `extra` is shallow-merged into the result so callers can supply
 * `info`, `servers`, `components`, `security`, `externalDocs`, or extra
 * `tags` without re-implementing the whole spec.
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
      item[HTTP_METHOD_BUCKETS[op.method]] = buildOperation(opName, op, route, fullPath);
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

  const { parameters: bodyParams, requestBody } = buildRequest(op);
  const pathParams = extractPathParameters(fullPath);
  const allParams: (OpenAPIv3Parameter | OpenAPIv3Reference)[] = [
    ...(op.parameters ?? []),
    ...bodyParams,
    ...pathParams,
  ];
  if (allParams.length > 0) operation.parameters = allParams;
  if (requestBody) operation.requestBody = requestBody;

  return operation;
}

interface BuiltRequest {
  parameters: OpenAPIv3Parameter[];
  requestBody: OpenAPIv3RequestBody | undefined;
}

function buildRequest(op: Operation): BuiltRequest {
  if (!op.request) return { parameters: [], requestBody: undefined };
  const fields = Metadata.lookupField(FieldSchema, op.request);
  if (!fields || fields.size === 0) {
    // No FieldSchema metadata — fall back to a single application/json body
    // produced by `toJsonSchema(class)` so the request still appears in the spec.
    return {
      parameters: [],
      requestBody: {
        required: true,
        content: {
          [op.requestType ?? 'application/json']: { schema: toJsonSchema(op.request) },
        },
      },
    };
  }

  const parameters: OpenAPIv3Parameter[] = [];
  const bodyProperties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  let rawBody: { schema: JsonSchema } | undefined;
  let hasFileField = false;

  for (const [key, entries] of fields) {
    const k = String(key);
    const fieldSchema = toJsonSchema(entries as readonly FieldSchemaDecoratorMetadata[]);
    const optional = (entries as readonly FieldSchemaDecoratorMetadata[]).some(
      (m) => m.factory === IsOptional,
    );

    const queryMeta = Metadata.ofField(InQuery, op.request, k);
    const headerMeta = Metadata.ofField(InHeader, op.request, k);
    const rawBodyMeta = Metadata.ofField(RawBody, op.request, k);
    const fileMeta = Metadata.ofField(IsFile, op.request, k);

    if (rawBodyMeta && rawBodyMeta.length > 0) {
      // Last-write-wins if multiple fields claim raw body (caller bug, but
      // don't crash).
      rawBody = { schema: fieldSchema };
      continue;
    }
    if (queryMeta && queryMeta.length > 0) {
      parameters.push({
        name: (queryMeta[0] as string | undefined) ?? k,
        in: 'query',
        required: !optional,
        schema: fieldSchema,
      });
      continue;
    }
    if (headerMeta && headerMeta.length > 0) {
      parameters.push({
        name: headerMeta[0] as string,
        in: 'header',
        required: !optional,
        schema: fieldSchema,
      });
      continue;
    }
    bodyProperties[k] = fieldSchema;
    if (!optional) required.push(k);
    if (fileMeta && fileMeta.length > 0) hasFileField = true;
  }

  let requestBody: OpenAPIv3RequestBody | undefined;
  if (rawBody) {
    requestBody = {
      required: true,
      content: {
        [op.requestType ?? 'application/octet-stream']: { schema: rawBody.schema },
      },
    };
  } else if (Object.keys(bodyProperties).length > 0) {
    const contentType =
      op.requestType ?? (hasFileField ? 'multipart/form-data' : 'application/json');
    const schema: JsonSchema = { type: 'object', properties: bodyProperties };
    if (required.length > 0) schema.required = required;
    requestBody = { required: true, content: { [contentType]: { schema } } };
  }

  return { parameters, requestBody };
}

function buildResponses(op: Operation): Record<string, OpenAPIv3Response> {
  const status = defaultStatus(op);
  const response: OpenAPIv3Response = { description: op.summary ?? '' };
  if (op.response) {
    response.content = {
      [op.responseType ?? 'application/json']: { schema: toJsonSchema(op.response) },
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
 * Reverse of {@link toOpenAPIv3}.
 *
 * - Operations are grouped by their first tag (untagged → `name: ''`).
 * - Each operation's `parameters` (query/header) and `requestBody` are
 *   decoded via {@link fromJsonSchema} and merged into a single synthesized
 *   request class: parameters become fields with `@InQuery(name)` /
 *   `@InHeader(name)` (plus `@IsOptional` when not required); body
 *   properties become regular fields; a non-object body becomes a single
 *   `body` field with `@RawBody`.
 * - The response class is the top-level decoded form of the first content
 *   type's schema.
 *
 * Path parameters are not folded back into the request class (path slot is
 * preserved on `Operation.path` instead).
 */
export function fromOpenAPIv3(spec: OpenAPIv3): RouteDefinition[] {
  const byTag = new Map<string, RouteDefinition>();
  for (const [path, item] of entryOf(spec.paths ?? {})) {
    for (const [bucket, method] of entryOf(HTTP_METHOD_FROM_BUCKET) as [
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
        request: buildRequestClass(op.parameters, op.requestBody),
        response: buildResponseClass(op.responses),
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

function buildRequestClass(
  parameters: (OpenAPIv3Parameter | OpenAPIv3Reference)[] | undefined,
  requestBody: OpenAPIv3RequestBody | OpenAPIv3Reference | undefined,
): AnyConstructor | null {
  interface PendingField {
    key: string;
    decorators: NestedFieldSchema;
    placement?: FieldDecorator<unknown>;
    optional: boolean;
  }
  const pending: PendingField[] = [];

  if (parameters) {
    for (const p of parameters) {
      if ('$ref' in p) continue;
      if (p.in !== 'query' && p.in !== 'header') continue;
      const decoded = decodeForField(p.schema as JsonSchema | undefined);
      pending.push({
        key: p.name,
        decorators: decoded,
        placement: (p.in === 'query'
          ? InQuery(p.name)
          : InHeader(p.name)) as FieldDecorator<unknown>,
        optional: p.required === false,
      });
    }
  }

  if (requestBody && !('$ref' in requestBody)) {
    const types = Object.keys(requestBody.content);
    if (types.length > 0) {
      const firstType = types[0];
      const schema = requestBody.content[firstType].schema;
      if (schema && !('$ref' in schema)) {
        const js = schema as JsonSchema;
        if (isObjectShape(js)) {
          const required = new Set(js.required ?? []);
          for (const [k, propSchema] of entryOf(js.properties ?? {})) {
            pending.push({
              key: k,
              decorators: decodeForField(propSchema),
              optional: !required.has(k),
            });
          }
        } else {
          pending.push({
            key: 'body',
            decorators: decodeForField(js),
            placement: RawBody() as FieldDecorator<unknown>,
            optional: false,
          });
        }
      }
    }
  }

  if (pending.length === 0) return null;

  class Request {}
  for (const { key, decorators: decs, placement, optional } of pending) {
    applyDecorators(Request as AnyConstructor, key, decs);
    if (placement) (placement as (target: unknown, key: string) => void)(Request.prototype, key);
    if (optional) IsOptional()(Request.prototype, key);
  }
  return Request as AnyConstructor;
}

function buildResponseClass(
  responses: OpenAPIv3Operation['responses'] | undefined,
): AnyConstructor | null {
  if (!responses) return null;
  for (const r of Object.values(responses)) {
    if (!r || '$ref' in r) continue;
    const types = Object.keys(r.content ?? {});
    if (types.length === 0) continue;
    const schema = r.content?.[types[0]].schema;
    if (!schema || '$ref' in schema) continue;
    const decoded = fromJsonSchema(schema as JsonSchema).root;
    if (typeof decoded === 'function') return decoded;
    // Non-object response — wrap into a single-field class so the caller still
    // gets a constructor it can plug into RouteDefinition.
    if (decoded.length > 0) {
      class Response {}
      applyDecorators(Response as AnyConstructor, 'value', decoded);
      return Response as AnyConstructor;
    }
  }
  return null;
}

/**
 * Decode a property/parameter schema into a flat decorator list. If the schema
 * is itself object-shaped the resulting class is wrapped in `Ref(class)` so it
 * can still be applied to a single field.
 */
function decodeForField(schema: JsonSchema | undefined): NestedFieldSchema {
  if (!schema) return [];
  const { root } = fromJsonSchema(schema);
  if (typeof root === 'function') return [Ref(root)];
  return root;
}

function applyDecorators(cls: AnyConstructor, key: string, decs: NestedFieldSchema): void {
  const arr = Array.isArray(decs) ? decs : [decs];
  for (const item of arr) {
    const meta: FieldSchemaDecoratorMetadata = isMeta(item) ? item : item.metadata;
    FieldSchema(meta.factory, meta.params, meta.options)(cls.prototype, key);
  }
}

function isMeta(
  v: FieldSchemaDecorator | FieldSchemaDecoratorMetadata,
): v is FieldSchemaDecoratorMetadata {
  return !('metadata' in v);
}

function isObjectShape(schema: JsonSchema): boolean {
  if (schema.type === 'object') return true;
  if (Array.isArray(schema.type) && schema.type.includes('object')) return true;
  return schema.properties !== undefined;
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

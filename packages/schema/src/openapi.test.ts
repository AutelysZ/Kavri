import { describe, expect, it } from 'vitest';
import {
  createFieldSchemaDecoratorFactory,
  FieldSchema,
  type FieldSchemaDecorator,
  Phase,
} from './field.js';
import { fromOpenAPIv3, type OpenAPIv3, toOpenAPIv3 } from './openapi.js';
import { defineRoute, del, get, head, patch, post, put } from './route.js';
import { Schema } from './schema.js';

// --- minimal field decorators (no validator deps) ----------------------------

export const StrType = createFieldSchemaDecoratorFactory(
  'StrType',
  (): FieldSchemaDecorator<undefined> => FieldSchema(StrType, void 0, void 0),
  {
    phase: Phase.Type,
    message: '',
    decode: ({ value }) => typeof value === 'string',
    toJsonSchema: () => ({ type: 'string' }),
  },
);

@Schema()
class Empty {}

@Schema()
class HelloRequest {
  @StrType()
  name!: string;
}

@Schema()
class HelloResponse {
  @StrType()
  greeting!: string;
}

// ---------------------------------------------------------------------------
// toOpenAPIv3
// ---------------------------------------------------------------------------

describe('toOpenAPIv3', () => {
  it('produces a minimal valid spec for an empty route list', () => {
    const spec = toOpenAPIv3([]);
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toEqual({ title: 'API', version: '0.0.0' });
    expect(spec.paths).toEqual({});
    expect(spec.tags).toBeUndefined();
  });

  it('emits a tag for each named route', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        description: 'user endpoints',
        operations: {},
      }),
      defineRoute({
        name: 'AdminRoute',
        path: '/admin',
        operations: {},
      }),
    ]);
    expect(spec.tags).toEqual([
      { name: 'UserRoute', description: 'user endpoints' },
      { name: 'AdminRoute' },
    ]);
  });

  it('does not duplicate tags when the same route name appears twice', () => {
    const spec = toOpenAPIv3([
      defineRoute({ name: 'Same', path: '/a', operations: {} }),
      defineRoute({ name: 'Same', path: '/b', operations: {} }),
    ]);
    expect(spec.tags).toEqual([{ name: 'Same' }]);
  });

  it('joins route path + operation key into the OpenAPI path key', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: {
          list: get(null, HelloResponse),
        },
      }),
    ]);
    expect(Object.keys(spec.paths)).toEqual(['/users/list']);
  });

  it('honors an explicit operation path', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: {
          create: post(HelloRequest, HelloResponse, '/new'),
        },
      }),
    ]);
    expect(Object.keys(spec.paths)).toEqual(['/users/new']);
  });

  it('treats operation `path: ""` as no suffix (route prefix only)', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'Root',
        path: '/users',
        operations: {
          list: get(null, HelloResponse, ''),
        },
      }),
    ]);
    expect(Object.keys(spec.paths)).toEqual(['/users']);
  });

  it('collapses duplicate slashes when joining', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/users/',
        operations: {
          list: get(null, HelloResponse, '/list'),
        },
      }),
    ]);
    expect(Object.keys(spec.paths)).toEqual(['/users/list']);
  });

  it('extracts {param} segments into operation.parameters', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: {
          getOne: get(null, HelloResponse, '/{id}/items/{itemId}'),
        },
      }),
    ]);
    const op = spec.paths['/users/{id}/items/{itemId}'].get;
    expect(op?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('keeps user-supplied parameters and appends path params', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: {
          getOne: get(null, HelloResponse, '/{id}', {
            parameters: [{ name: 'lang', in: 'query', schema: { type: 'string' } }],
          }),
        },
      }),
    ]);
    const op = spec.paths['/users/{id}'].get;
    expect(op?.parameters).toEqual([
      { name: 'lang', in: 'query', schema: { type: 'string' } },
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('serializes a request class into requestBody.application/json', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: { create: post(HelloRequest, HelloResponse) },
      }),
    ]);
    const body = spec.paths['/users/create'].post?.requestBody;
    expect(body).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    });
  });

  it('omits requestBody when request is null', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: { list: get(null, HelloResponse) },
      }),
    ]);
    expect(spec.paths['/users/list'].get?.requestBody).toBeUndefined();
  });

  it('honors a custom requestType', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/u',
        operations: {
          create: post(HelloRequest, null, {
            requestType: 'application/x-www-form-urlencoded',
          }),
        },
      }),
    ]);
    const body = spec.paths['/u/create'].post?.requestBody;
    if (!body || '$ref' in body) throw new Error('expected inline requestBody');
    expect(Object.keys(body.content)).toEqual(['application/x-www-form-urlencoded']);
  });

  it('defaults the response status to 204 when there is no response', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { delete_: del(null, null) },
      }),
    ]);
    expect(Object.keys(spec.paths['/x/delete_'].delete?.responses ?? {})).toEqual(['204']);
  });

  it('defaults to 201 for POST with a response', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { create: post(HelloRequest, HelloResponse) },
      }),
    ]);
    expect(Object.keys(spec.paths['/x/create'].post?.responses ?? {})).toEqual(['201']);
  });

  it('defaults to 200 for GET with a response', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { list: get(null, HelloResponse) },
      }),
    ]);
    expect(Object.keys(spec.paths['/x/list'].get?.responses ?? {})).toEqual(['200']);
  });

  it('defaults to 200 for non-POST methods with response', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          replace: put(HelloRequest, HelloResponse),
          modify: patch(HelloRequest, HelloResponse),
        },
      }),
    ]);
    expect(Object.keys(spec.paths['/x/replace'].put?.responses ?? {})).toEqual(['200']);
    expect(Object.keys(spec.paths['/x/modify'].patch?.responses ?? {})).toEqual(['200']);
  });

  it('respects an explicit status override', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          accepted: post(HelloRequest, HelloResponse, { status: 202 }),
        },
      }),
    ]);
    expect(Object.keys(spec.paths['/x/accepted'].post?.responses ?? {})).toEqual(['202']);
  });

  it('serializes the response class into the chosen status content', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { list: get(null, HelloResponse) },
      }),
    ]);
    const responses = spec.paths['/x/list'].get?.responses ?? {};
    expect(responses['200']).toEqual({
      description: '',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { greeting: { type: 'string' } },
          },
        },
      },
    });
  });

  it('honors a custom responseType', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          download: get(null, HelloResponse, {
            responseType: 'application/octet-stream',
          }),
        },
      }),
    ]);
    const r = spec.paths['/x/download'].get?.responses['200'];
    if (!r || '$ref' in r) throw new Error('unexpected ref');
    expect(Object.keys(r.content ?? {})).toEqual(['application/octet-stream']);
  });

  it('handles a class with no field decorators (Empty → {type:object})', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { ping: post(Empty, Empty) },
      }),
    ]);
    const body = spec.paths['/x/ping'].post?.requestBody;
    if (!body || '$ref' in body) throw new Error('expected inline requestBody');
    expect(body.content['application/json'].schema).toEqual({ type: 'object' });
  });

  it('attaches the route name as the operation tag', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/u',
        operations: { list: get(null, HelloResponse) },
      }),
    ]);
    expect(spec.paths['/u/list'].get?.tags).toEqual(['UserRoute']);
  });

  it('flows summary and description through to the operation', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          list: get(null, HelloResponse, {
            summary: 'List things',
            description: 'Returns the list',
          }),
        },
      }),
    ]);
    const op = spec.paths['/x/list'].get;
    expect(op?.summary).toBe('List things');
    expect(op?.description).toBe('Returns the list');
  });

  it('flips deprecated to boolean and folds the why-string into description', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          old: get(null, HelloResponse, { deprecated: 'use /v2/list' }),
        },
      }),
    ]);
    const op = spec.paths['/x/old'].get;
    expect(op?.deprecated).toBe(true);
    expect(op?.description).toContain('use /v2/list');
  });

  it('combines existing description with deprecated reason', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          old: get(null, HelloResponse, {
            description: 'legacy listing',
            deprecated: 'use /v2/list',
          }),
        },
      }),
    ]);
    expect(spec.paths['/x/old'].get?.description).toBe(
      'legacy listing\n\n[Deprecated] use /v2/list',
    );
  });

  it('uses the operation summary as the response description when set', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          list: get(null, HelloResponse, { summary: 'List things' }),
        },
      }),
    ]);
    const r = spec.paths['/x/list'].get?.responses['200'];
    if (!r || '$ref' in r) throw new Error('unexpected ref');
    expect(r.description).toBe('List things');
  });

  it('supports all six HTTP methods', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'All',
        path: '/x',
        operations: {
          a: get(null, HelloResponse),
          b: post(HelloRequest, HelloResponse),
          c: put(HelloRequest, HelloResponse),
          d: patch(HelloRequest, HelloResponse),
          e: del(null, null),
          f: head(null, null),
        },
      }),
    ]);
    expect(spec.paths['/x/a'].get).toBeDefined();
    expect(spec.paths['/x/b'].post).toBeDefined();
    expect(spec.paths['/x/c'].put).toBeDefined();
    expect(spec.paths['/x/d'].patch).toBeDefined();
    expect(spec.paths['/x/e'].delete).toBeDefined();
    expect(spec.paths['/x/f'].head).toBeDefined();
  });

  it('places multiple operations under the same path', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: {
          list: get(null, HelloResponse, ''),
          create: post(HelloRequest, HelloResponse, ''),
        },
      }),
    ]);
    expect(Object.keys(spec.paths)).toEqual(['/x']);
    expect(spec.paths['/x'].get).toBeDefined();
    expect(spec.paths['/x'].post).toBeDefined();
  });

  it('merges `extra` into the result', () => {
    const spec = toOpenAPIv3([], {
      info: { title: 'My API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
      security: [{ bearer: [] }],
      externalDocs: { url: 'https://docs.example.com' },
    });
    expect(spec.info).toEqual({ title: 'My API', version: '1.0.0' });
    expect(spec.servers).toEqual([{ url: 'https://api.example.com' }]);
    expect(spec.security).toEqual([{ bearer: [] }]);
    expect(spec.externalDocs).toEqual({ url: 'https://docs.example.com' });
  });

  it('appends `extra.tags` to the auto-built tag list', () => {
    const spec = toOpenAPIv3(
      [defineRoute({ name: 'A', path: '/a', operations: {} })],
      { tags: [{ name: 'Z', description: 'sentinel' }] },
    );
    expect(spec.tags).toEqual([
      { name: 'A' },
      { name: 'Z', description: 'sentinel' },
    ]);
  });

  it('uses the operationId equal to the operation key', () => {
    const spec = toOpenAPIv3([
      defineRoute({
        name: 'X',
        path: '/x',
        operations: { listEverything: get(null, HelloResponse) },
      }),
    ]);
    expect(spec.paths['/x/listEverything'].get?.operationId).toBe('listEverything');
  });
});

// ---------------------------------------------------------------------------
// fromOpenAPIv3
// ---------------------------------------------------------------------------

describe('fromOpenAPIv3', () => {
  it('returns an empty list for an empty paths object', () => {
    expect(fromOpenAPIv3({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} }))
      .toEqual([]);
  });

  it('groups operations by their first tag', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/users/list': {
          get: { operationId: 'list', tags: ['UserRoute'], responses: { 200: { description: '' } } },
        },
        '/admin/ping': {
          get: { operationId: 'ping', tags: ['AdminRoute'], responses: { 200: { description: '' } } },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    expect(routes.map((r) => r.name).sort()).toEqual(['AdminRoute', 'UserRoute']);
  });

  it('puts untagged operations under name=""', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: { operationId: 'x', responses: { 200: { description: '' } } },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('');
  });

  it('reconstructs method/path/operationId/status', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/users/{id}': {
          get: {
            operationId: 'getOne',
            tags: ['UserRoute'],
            summary: 'Fetch by id',
            description: 'returns one user',
            responses: { 200: { description: '' } },
          },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    expect(routes).toHaveLength(1);
    const op = routes[0].operations.getOne;
    expect(op).toMatchObject({
      method: 'GET',
      path: '/users/{id}',
      request: null,
      response: null,
      summary: 'Fetch by id',
      description: 'returns one user',
      status: 200,
    });
  });

  it('flips deprecated boolean back to a (placeholder) string', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: { operationId: 'x', deprecated: true, responses: { 200: { description: '' } } },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    expect(routes[0].operations.x.deprecated).toBe('');
  });

  it('synthesizes an operationId when one is missing', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x/y': {
          get: { responses: { 200: { description: '' } } },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    const opName = Object.keys(routes[0].operations)[0];
    expect(opName).toMatch(/^get/);
    expect(opName).toContain('x_y');
  });

  it('reads back every HTTP method bucket', () => {
    const spec: OpenAPIv3 = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: { operationId: 'a', responses: { 200: { description: '' } } },
          post: { operationId: 'b', responses: { 201: { description: '' } } },
          put: { operationId: 'c', responses: { 200: { description: '' } } },
          patch: { operationId: 'd', responses: { 200: { description: '' } } },
          delete: { operationId: 'e', responses: { 204: { description: '' } } },
          head: { operationId: 'f', responses: { 200: { description: '' } } },
        },
      },
    };
    const routes = fromOpenAPIv3(spec);
    expect(routes).toHaveLength(1);
    const methods = Object.values(routes[0].operations).map((o) => o.method).sort();
    expect(methods).toEqual(['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT']);
  });

  it('round-trips method/path/operationId/tag through to → from', () => {
    const original = toOpenAPIv3([
      defineRoute({
        name: 'UserRoute',
        path: '/users',
        operations: {
          list: get(null, HelloResponse),
          create: post(HelloRequest, HelloResponse),
        },
      }),
    ]);
    const rebuilt = fromOpenAPIv3(original);
    expect(rebuilt).toHaveLength(1);
    const route = rebuilt[0];
    expect(route.name).toBe('UserRoute');
    expect(Object.keys(route.operations).sort()).toEqual(['create', 'list']);
    expect(route.operations.list.method).toBe('GET');
    expect(route.operations.list.path).toBe('/users/list');
    expect(route.operations.create.method).toBe('POST');
    expect(route.operations.create.status).toBe(201);
  });
});

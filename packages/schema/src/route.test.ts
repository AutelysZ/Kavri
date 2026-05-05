import type { AnyConstructor } from '@kavri/basic';
import { describe, expect, it } from 'vitest';
import {
  defineRoute,
  del,
  get,
  head,
  type Operation,
  patch,
  post,
  put,
  type RouteDefinition,
} from './route.js';
import { Schema } from './schema.js';

@Schema()
class CreateUser {
  name!: string;
}

@Schema()
class UserResponse {
  id!: string;
}

// ---------------------------------------------------------------------------
// Per-method builders
// ---------------------------------------------------------------------------

describe('per-method builders', () => {
  it('get sets method to GET', () => {
    expect(get(null, UserResponse).method).toBe('GET');
  });

  it('post sets method to POST', () => {
    expect(post(CreateUser, UserResponse).method).toBe('POST');
  });

  it('put sets method to PUT', () => {
    expect(put(CreateUser, UserResponse).method).toBe('PUT');
  });

  it('del sets method to DELETE', () => {
    expect(del(null, null).method).toBe('DELETE');
  });

  it('head sets method to HEAD', () => {
    expect(head(null, null).method).toBe('HEAD');
  });

  it('patch sets method to PATCH', () => {
    expect(patch(CreateUser, UserResponse).method).toBe('PATCH');
  });

  it('captures the request and response constructors', () => {
    const op = post(CreateUser, UserResponse);
    expect(op.request).toBe(CreateUser);
    expect(op.response).toBe(UserResponse);
  });

  it('accepts `null` for either request or response', () => {
    const a = get(null, UserResponse);
    const b = post(CreateUser, null);
    const c = del(null, null);
    expect(a.request).toBeNull();
    expect(b.response).toBeNull();
    expect(c.request).toBeNull();
    expect(c.response).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Overload: (req, res, path, options?)
// ---------------------------------------------------------------------------

describe('builder overload (path string)', () => {
  it('treats the third argument as the operation path', () => {
    const op = get(null, UserResponse, '/list');
    expect(op.path).toBe('/list');
  });

  it('still accepts further options after the path', () => {
    const op = post(CreateUser, UserResponse, '/new', {
      summary: 'Create',
      idempotency: 'volatile',
    });
    expect(op.path).toBe('/new');
    expect(op.summary).toBe('Create');
    expect(op.idempotency).toBe('volatile');
  });

  it('lets explicit `path` win over an `options.path`', () => {
    const op = get(null, UserResponse, '/explicit', { path: '/from-options' });
    expect(op.path).toBe('/explicit');
  });

  it('treats `path: ""` as a deliberate empty suffix', () => {
    const op = get(null, UserResponse, '');
    expect(op.path).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Overload: (req, res, options?)
// ---------------------------------------------------------------------------

describe('builder overload (options object)', () => {
  it('merges the options object into the operation', () => {
    const op = post(CreateUser, UserResponse, {
      summary: 'Create user',
      description: 'Persists a user record',
      idempotency: 'volatile',
      status: 202,
      maxBodySize: 1 << 20,
      requestType: 'application/x-ndjson',
      responseType: 'application/json',
    });
    expect(op).toMatchObject({
      summary: 'Create user',
      description: 'Persists a user record',
      idempotency: 'volatile',
      status: 202,
      maxBodySize: 1 << 20,
      requestType: 'application/x-ndjson',
      responseType: 'application/json',
    });
  });

  it('keeps a deprecated string', () => {
    const op = get(null, UserResponse, { deprecated: 'use /v2/users' });
    expect(op.deprecated).toBe('use /v2/users');
  });

  it('omits `path` when not provided', () => {
    const op = get(null, UserResponse);
    expect(op.path).toBeUndefined();
  });

  it('preserves OpenAPI-derived fields like `parameters` and `tags`', () => {
    const op = get(null, UserResponse, {
      tags: ['users'],
      parameters: [{ name: 'lang', in: 'query', schema: { type: 'string' } }],
    });
    expect(op.tags).toEqual(['users']);
    expect(op.parameters).toEqual([
      { name: 'lang', in: 'query', schema: { type: 'string' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// defineRoute
// ---------------------------------------------------------------------------

describe('defineRoute', () => {
  it('returns the same object reference (identity helper)', () => {
    const def: RouteDefinition = {
      name: 'UserRoute',
      path: '/users',
      operations: {},
    };
    expect(defineRoute(def)).toBe(def);
  });

  it('captures shared options on the route root', () => {
    const def = defineRoute({
      name: 'UserRoute',
      path: '/users',
      summary: 'User endpoints',
      description: 'CRUD',
      deprecated: 'use AccountRoute',
      maxBodySize: 4096,
      requestType: 'application/json',
      responseType: 'application/json',
      operations: {},
    });
    expect(def).toMatchObject({
      summary: 'User endpoints',
      description: 'CRUD',
      deprecated: 'use AccountRoute',
      maxBodySize: 4096,
      requestType: 'application/json',
      responseType: 'application/json',
    });
  });

  it('preserves operation typing through the generic', () => {
    const def = defineRoute({
      name: 'UserRoute',
      path: '/users',
      operations: {
        list: get(null, UserResponse),
        create: post(CreateUser, UserResponse),
      },
    });
    // Compile-time narrowing: each operation key resolves to its specific
    // Operation<TReq, TRes>, not the wider erased type.
    const list: Operation<unknown, UserResponse> = def.operations.list;
    const create: Operation<CreateUser, UserResponse> = def.operations.create;
    expect(list.method).toBe('GET');
    expect(create.method).toBe('POST');
    expect(create.request).toBe(CreateUser);
  });

  it('infers TReq/TRes from per-operation builders', () => {
    const def = defineRoute({
      name: 'X',
      path: '/x',
      operations: { create: post(CreateUser, UserResponse) },
    });
    // Force the inferred type to surface through an explicit annotation —
    // the typecheck step is the real assertion.
    const reqCtor: AnyConstructor<CreateUser> | null = def.operations.create.request;
    const resCtor: AnyConstructor<UserResponse> | null = def.operations.create.response;
    expect(reqCtor).toBe(CreateUser);
    expect(resCtor).toBe(UserResponse);
  });
});

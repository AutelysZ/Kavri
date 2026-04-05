# HTTP Layer Design

## 1. Principles

- **Framework-independent.** Core design has no dependency on Express, Fastify, etc. The HTTP layer produces a standard `(req, res) => void` handler usable with `node:http`, Bun, Deno, or any adapter.
- **Parsed input only.** Handlers receive validated, typed data — not raw streams. Body parsing happens before handlers and interceptors see the request (gRPC-style).
- **Single interception mechanism.** Interceptors replace middleware, guards, pipes, and filters. One abstraction, one chain.
- **Controllers are singletons.** Per-request data lives in scoped `RequestContext`, not in the controller instance.
- **Definition/implementation separation.** `createService()` produces a shareable type-safe contract. Backend implements it; frontend consumes it.

## 2. Core HTTP Types

```ts
class HttpException extends Error {
    readonly status: number;
    readonly headers?: Record<string, string>;
    constructor(status: number, message?: string, headers?: Record<string, string>);
}

// Special response types (bypass normal JSON serialization)
class Redirect {
    constructor(readonly url: string, readonly status?: number); // default 302
}

class FileResponse {
    constructor(readonly path: string, readonly contentType?: string);
}

class StreamResponse {
    constructor(readonly stream: ReadableStream, readonly contentType: string);
}

class RawResponse {
    constructor(readonly status: number, readonly headers: Record<string, string>, readonly body: unknown);
}
```

Normal handler return → JSON serialized with 200. Return `Redirect`, `FileResponse`, `StreamResponse`, or `RawResponse` for non-standard responses.

## 3. RequestContext

```ts
declare class RequestContext {
    readonly method: string;
    readonly url: string;
    readonly headers: ReadonlyMap<string, string>;
    readonly params: Readonly<Record<string, string>>;   // route params
    readonly query: Readonly<Record<string, string>>;     // query string
    readonly body: unknown;                                // parsed body

    // Key-value store (for interceptors to pass data to handlers)
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;

    /** Get the current request context. Reads from AsyncLocalStorage. */
    static get(): RequestContext;
}
```

`RequestContext` is a static API backed by `AsyncLocalStorage`. Not injectable, not a component. The framework creates it per-request and stores it in `AsyncLocalStorage`. Access it anywhere via `RequestContext.get()`.

No scoped scope needed. All components remain singletons.

## 4. Controller & Method Decorators

### @Controller(path)

```ts
interface ControllerMetadata {
    path: string;
}

// Composes @Component() — controllers are singletons.
// Per-request data is in scoped RequestContext, not the controller.
declare function Controller(path: string): ClassDecorator<ControllerMetadata>;
```

`path` must start with `/` and must not end with `/`.

### @Get, @Post, @Put, @Delete, @Patch, @Head

```ts
interface EndpointMetadata<TReq = any, TRes = any> {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
    path: string;
    requestSchema?: ConfigParser<TReq>;
    responseSchema?: ConfigParser<TRes>;
}

declare function Get<TReq, TRes>(
    path?: string,
    requestSchema?: ConfigParser<TReq>,
    responseSchema?: ConfigParser<TRes>,
): MethodDecorator<EndpointMetadata<TReq, TRes>>;

// Same for Post, Put, Delete, Patch, Head
```

`path` is optional (defaults to `''`). If present, must start with `/` and not end with `/`. May contain route params (`:id`).

`requestSchema` validates the merged input (params + query for GET/DELETE/HEAD; params + query + body for POST/PUT/PATCH). `responseSchema` validates the return value (optional — omit for special responses).

### Handler method signature

```ts
@Controller('/user')
class UserController {
    constructor(
        private readonly userRepo = inject(UserRepository),
    ) {}

    // Handler receives parsed input. Access request via RequestContext.get().
    @Get('/:id', GetUserParams, UserResponse)
    async getUser(input: GetUserParams): Promise<User> {
        return this.userRepo.findById(input.id);
    }

    @Post('/', CreateUserBody, UserResponse)
    async createUser(input: CreateUserBody): Promise<User> {
        const userId = RequestContext.get().get<string>('userId'); // set by AuthInterceptor
        return this.userRepo.create({ ...input, createdBy: userId });
    }

    @Get('/old/:id', RedirectParams)
    async redirectOld(input: RedirectParams): Promise<Redirect> {
        return new Redirect(`/user/${input.id}`);
    }

    @Get('/avatar/:id', AvatarParams)
    async avatar(input: AvatarParams): Promise<FileResponse> {
        return new FileResponse(`./avatars/${input.id}.png`, 'image/png');
    }
}
```

Handler receives parsed `input` as first param. Returns typed response or a special response object.

## 5. Interceptors

```ts
interface InterceptorContext {
    readonly controller: AnyConstructor<any>;
    readonly method: string | symbol;
    readonly endpoint: EndpointMetadata;
    // Access request via RequestContext.get()
}

abstract class Interceptor {
    abstract intercept(
        context: InterceptorContext,
        next: () => Promise<unknown>,
    ): Promise<unknown>;
}
```

Interceptors are `@Component()` classes extending `Interceptor`. Discovered via `injectAll(Interceptor)`. Called in dependency order, serially. `next()` invokes the next interceptor or the handler.

Interceptors can:
- Short-circuit: `throw new HttpException(401)` or return without calling `next()`
- Modify context: `context.request.set('user', authUser)`
- Transform response: `const res = await next(); return transform(res);`

```ts
@Component()
class LoggingInterceptor extends Interceptor {
    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        const start = Date.now();
        try {
            return await next();
        } finally {
            console.log(`${ctx.endpoint.method} ${RequestContext.get().url} ${Date.now() - start}ms`);
        }
    }
}
```

### Built-in: BasicAuthInterceptor

```ts
const BasicAuthConfig = createConfiguration('auth.basic', z.object({
    username: z.string(),
    password: z.string(),
    realm: z.string().default('Restricted'),
}));

@Component({
    condition: (config = inject(BasicAuthConfig, true)) => config !== undefined,
})
class BasicAuthInterceptor extends Interceptor {
    constructor(private readonly config = inject(BasicAuthConfig)) { super(); }

    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        const auth = RequestContext.get().headers.get('authorization');
        // parse Basic auth, compare, throw HttpException(401) on failure
        return next();
    }
}
```

## 6. Service Definition (shared contract)

### createService — define the contract

```ts
const UserServiceDef = createService('/user')
    .get('getUser', '/:id', GetUserParams, UserResponse)
    .post('createUser', '/', CreateUserBody, UserResponse)
    .delete('deleteUser', '/:id', DeleteUserParams);
```

`createService(basePath)` returns a builder. Each method call (`.get()`, `.post()`, etc.) adds an endpoint. The result is a typed service definition object that encodes all method names, request/response types, and routes.

This file can be shared between frontend and backend packages.

### createController — backend implementation

```ts
@ControllerImpl()
class UserController extends createController(UserServiceDef) {
    constructor(private readonly repo = inject(UserRepository)) { super(); }

    override async getUser(input: GetUserParams): Promise<UserResponse> {
        return this.repo.findById(input.id);
    }

    override async createUser(input: CreateUserBody): Promise<UserResponse> {
        return this.repo.create(input);
    }

    override async deleteUser(input: DeleteUserParams): Promise<void> {
        await this.repo.delete(input.id);
    }
}
```

`createController(def)` returns an abstract class with abstract methods for each endpoint. Types are inferred from the schemas.

`@ControllerImpl()` applies `@Controller(basePath)` and the appropriate `@Get`/`@Post`/etc. decorators to each method, derived from the service definition. No manual decorator duplication.

### createClient — frontend consumption

```ts
import { createClient } from 'kavri/http-client';

const client = createClient(UserServiceDef, { baseUrl: 'https://api.example.com' });

const user = await client.getUser({ id: '123' });  // typed: UserResponse
await client.createUser({ name: 'Alice', email: 'alice@example.com' });
```

`createClient(def, options)` returns a typed client with methods matching the service definition. Each method makes an HTTP request.

## 7. OpenAPI Generation

```ts
interface OpenAPIOptions {
    title: string;
    version: string;
    description?: string;
}

declare function generateOpenAPI(
    entrypoint: AnyConstructor<any>,
    options: OpenAPIOptions,
): object;  // OpenAPI 3.x document
```

Reads `Metadata.entries(Controller)` to find all controllers, then `Metadata.of(Get/Post/etc, controller)` for endpoints. Extracts schemas for request params/body and response body. Zod schemas are converted to JSON Schema via `zod-to-json-schema`.

Static generation — no running container needed. Works from metadata alone.

## 8. Static Assets

```ts
const StaticConfig = createConfiguration('static', z.object({
    root: z.string().default('./public'),
    prefix: z.string().default('/static'),
}));

@Component({
    condition: (config = inject(StaticConfig, true)) => config !== undefined,
})
class StaticFileInterceptor extends Interceptor {
    constructor(private readonly config = inject(StaticConfig)) { super(); }

    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        if (RequestContext.get().url.startsWith(this.config.prefix)) {
            const filePath = resolve(this.config.root, RequestContext.get().url.slice(this.config.prefix.length));
            return new FileResponse(filePath);
        }
        return next();
    }
}
```

Static file serving is an interceptor. Enabled when `static` config is present.

## 9. Database Transactions (Drizzle + AsyncLocalStorage)

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

const txStorage = new AsyncLocalStorage<DrizzleTransaction>();

function Transactional(): MethodDecorator<{}> {
    return createMethodDecorator(Transactional, {});
}

@Component()
class TransactionInterceptor extends Interceptor {
    constructor(private readonly db = inject(DrizzleDatabase)) { super(); }

    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        const isTx = Metadata.of(Transactional, ctx.controller, ctx.method).length > 0;
        if (isTx) {
            return this.db.transaction((tx) => txStorage.run(tx, next));
        }
        return next();
    }
}

// Repository base — uses current transaction if available
@Component()
abstract class Repository<T> {
    constructor(private readonly db = inject(DrizzleDatabase)) {}

    protected get connection() {
        return txStorage.getStore() ?? this.db;
    }
}
```

Usage:

```ts
@Controller('/order')
class OrderController {
    constructor(private readonly orderRepo = inject(OrderRepository)) {}

    @Post('/', CreateOrderBody, OrderResponse)
    @Transactional()
    async createOrder(input: CreateOrderBody): Promise<OrderResponse> {
        // All repo calls within this handler use the same transaction
        return this.orderRepo.create(input);
    }
}
```

## 10. Configuration

```ts
const HttpConfig = createConfiguration('http', z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().default(3000),
}));

const DatabaseConfig = createConfiguration('database', z.object({
    url: z.string(),
    pool: z.object({
        min: z.number().default(2),
        max: z.number().default(10),
    }).default({}),
}));
```

## 11. Error Handling

Unhandled exceptions in handlers/interceptors are caught by the framework:

- `HttpException` → mapped to HTTP response with status code and message
- Other errors → 500 Internal Server Error (message hidden in production)

Error serialization:

```json
{
    "status": 404,
    "message": "User not found"
}
```

Custom error handling via interceptor:

```ts
@Component()
class ErrorInterceptor extends Interceptor {
    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        try {
            return await next();
        } catch (err) {
            if (err instanceof AppError) {
                throw new HttpException(err.httpStatus, err.message);
            }
            throw err;
        }
    }
}
```

## 12. Application Startup

```ts
declare class WebApplication {
    constructor(entrypoint: AnyConstructor<any>);

    /** Start HTTP server using HttpConfig. */
    start(): Promise<void>;

    /** Return raw Node.js HTTP handler for http.createServer(). */
    toHandler(): (req: IncomingMessage, res: ServerResponse) => void;

    /** Graceful shutdown. Destroys the internal container. */
    stop(): Promise<void>;
}
```

### Per-request lifecycle

1. Receive HTTP request
2. Route matching → find controller instance (singleton) + method + endpoint metadata
3. Parse request: extract params, query, body. Validate with `requestSchema`.
4. Create `RequestContext`, store in `AsyncLocalStorage`
5. Run interceptor chain → call handler with `(parsedInput)`
6. Handler returns typed value or special response
7. If `responseSchema`, validate response. Serialize as JSON with 200.
8. If special response (`Redirect`, `FileResponse`, etc.), handle accordingly.

### Bootstrap example

```ts
// config/config.yaml:
// ---
// http:
//   port: 3000
// database:
//   url: postgres://localhost/myapp

@Component()
@Touch(UserController, OrderController)
@Touch(LoggingInterceptor, TransactionInterceptor, BasicAuthInterceptor)
@Use(InfraModule)
class MyApplication {}

const app = new WebApplication(MyApplication);
await app.start();
// Server listening on 0.0.0.0:3000

// Or: manual handler
// const handler = app.toHandler();
// http.createServer(handler).listen(3000);
```

## 13. Full Example

```ts
import { z } from 'zod';
import {
    Controller, Get, Post, Delete, ControllerImpl,
    createService, createController, createClient,
    Interceptor, RequestContext, HttpException,
    WebApplication, Transactional, FileResponse, Redirect,
} from 'kavri/http';
import {
    Component, Touch, Use, Provide,
    inject, injectAll, token,
    createConfiguration,
} from 'kavri';

// ---- Shared service definition ----

const GetUserParams = z.object({ id: z.string() });
const CreateUserBody = z.object({ name: z.string(), email: z.string().email() });
const UserResponse = z.object({ id: z.string(), name: z.string(), email: z.string() });

const UserServiceDef = createService('/user')
    .get('getUser', '/:id', GetUserParams, UserResponse)
    .post('createUser', '/', CreateUserBody, UserResponse)
    .delete('deleteUser', '/:id', GetUserParams);

// ---- Controller implementation ----

@ControllerImpl()
class UserController extends createController(UserServiceDef) {
    constructor(private readonly repo = inject(UserRepository)) { super(); }

    override async getUser(input: z.infer<typeof GetUserParams>) {
        const user = await this.repo.findById(input.id);
        if (!user) throw new HttpException(404, 'User not found');
        return user;
    }

    override async createUser(input: z.infer<typeof CreateUserBody>) {
        return this.repo.create(input);
    }

    override async deleteUser(input: z.infer<typeof GetUserParams>) {
        await this.repo.delete(input.id);
    }
}

// ---- Interceptors ----

@Component()
class AuthInterceptor extends Interceptor {
    async intercept(ctx, next) {
        const token = RequestContext.get().headers.get('authorization');
        if (!token) throw new HttpException(401);
        RequestContext.get().set('userId', verifyToken(token));
        return next();
    }
}

// ---- Bootstrap ----

@Component()
@Touch(UserController)
@Touch(AuthInterceptor)
class MyApp {}

const app = new WebApplication(MyApp);
await app.start();
```

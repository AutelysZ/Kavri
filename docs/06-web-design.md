# Web Module Design

## 1. Principles

- **Framework-independent.** Core design has no dependency on Express, Fastify, etc. The web module produces a standard `(req, res) => void` handler usable with `node:http`, Bun, Deno, or any adapter.
- **Parsed input only.** Handlers receive validated, typed data — not raw streams. Body parsing happens before handlers and interceptors see the request (gRPC-style).
- **Single interception mechanism.** Interceptors replace middleware, guards, pipes, and filters. One abstraction, one chain.
- **Controllers are singletons.** Per-request data lives in `RequestContext` — a typed key-value store backed by `AsyncLocalStorage`.
- **Route-first.** All endpoints are defined via `defineRoute()` in `@kavri/schema`. Controllers implement routes via `@Controller()` + `createController(route)`.

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

A typed key-value store for per-request state. Static API backed by `AsyncLocalStorage`. Accessible anywhere during a request — controllers, interceptors, services.

```ts
/** Typed context key. Public API lives on Key, not on RequestContext. */
declare class Key<T> {
    readonly name?: string;

    /** Get value from current request context. Returns undefined if not set. */
    get(): T | undefined;

    /** Get value or throw if not set. */
    getOrThrow(): T;

    /** Get value, or insert one computed by fn if not present. */
    getOrInsertComputed(fn: () => T): T;

    /** Set value in current request context. */
    set(value: T): void;
}

declare const RequestContext: {
    /** Create a typed key. */
    key<T>(name?: string): Key<T>;

    /** Check if currently inside a request context. */
    isActive(): boolean;

    /** Run fn inside a new request context. Called by the framework per-request. */
    run<T>(fn: () => Awaitable<T>): Promise<T>;
};
```

### Built-in request keys

The framework sets these during request processing:

```ts
import { IncomingMessage, ServerResponse } from 'node:http';

// --- Set by framework at request start ---

/** The raw Node.js request. */
const Request = RequestContext.key<IncomingMessage>('request');

/** The raw Node.js response. */
const Response = RequestContext.key<ServerResponse>('response');

// --- Set by ROUTE stage ---

/** The matched endpoint metadata from defineRoute. Null if no route matched. */
const Endpoint = RequestContext.key<Endpoint<any, any> | null>('endpoint');

/** The matched controller instance. Null if no route matched. */
const Controller = RequestContext.key<object | null>('controller');

// --- Set by PARSE stage (raw pieces) ---

/** Path parameters extracted by the router. */
const PathParams = RequestContext.key<Record<string, string>>('pathParams');

/** Query string parameters. */
const Query = RequestContext.key<Record<string, string>>('query');

/** Parsed request body (JSON object, string, etc.). */
const Body = RequestContext.key<unknown>('body');

/** Uploaded files (multipart requests only). */
const Files = RequestContext.key<Record<string, MultipartFile | MultipartFile[]>>('files');

// --- Set by RESOLVE stage (merged) ---

/** Final merged params: path params + query + body + files, shaped to request schema. */
const Params = RequestContext.key<unknown>('params');
```

### Usage

```ts
// Read built-in request data
const req = Request.getOrThrow();
const params = Params.get();

// Custom keys for interceptor → handler communication
const CurrentUser = RequestContext.key<User>('currentUser');

// In interceptor:
CurrentUser.set(authenticatedUser);

// In handler:
const user = CurrentUser.getOrThrow();
```

## 4. Controllers

Controllers are the sole mechanism for implementing HTTP endpoints. Every controller implements a route definition from `@kavri/schema`.

### createController + @Controller

```ts
import { createController, Controller } from '@kavri/web';
import { UserRoute } from './user-route';

@Controller()
class UserController extends createController(UserRoute) {
    constructor(private readonly repo = inject(UserRepository)) { super(); }

    override async getUser(input: GetUserParams): Promise<UserResponse> {
        return this.repo.findById(input.id);
    }

    override async createUser(input: CreateUserBody): Promise<UserResponse> {
        const userId = CurrentUser.getOrThrow().id;
        return this.repo.create({ ...input, createdBy: userId });
    }

    override async deleteUser(input: GetUserParams): Promise<void> {
        await this.repo.delete(input.id);
    }
}
```

- `createController(route)` returns an abstract class with abstract methods matching the route definition. Types are inferred from the route's request/response schemas.
- `@Controller()` composes `@Component()` and registers all routing metadata from the route definition.
- Handlers receive parsed input. Return typed response or a special response object (`Redirect`, `FileResponse`, etc.).
- Access per-request data via `Key.get()` / `Key.getOrThrow()`.

## 5. Interceptors

```ts
abstract class Interceptor {
    abstract intercept(next: () => unknown): Awaitable<unknown>;

    /** Priority anchors. Use with @Priority() to order interceptors.
     *  All Interceptor subclasses MUST have @Priority(). Enforced at startup. */
    static readonly RESPONSE  = 1000;   // write result to HTTP response
    static readonly BOOTSTRAP = 2000;   // logging, metrics, request ID
    static readonly EXCEPTION = 3000;   // error handling, error formatting
    static readonly ROUTE     = 4000;   // route matching, static files
    static readonly CORS      = 5000;   // CORS preflight handling
    static readonly GUARD     = 6000;   // auth, rate limiting, RBAC
    static readonly PARSE     = 7000;   // decode raw body (JSON, multipart, binary)
    static readonly RESOLVE   = 8000;   // merge path params + query + body + files → Params
    static readonly VALIDATE  = 9000;   // validate Params against request schema
    static readonly HANDLER   = 10000;  // handler execution, transactions
}
```

Interceptors are `@Component()` classes extending `Interceptor`. Discovered via `injectAll(Interceptor, 'priority')`. Sorted by `@Priority` value (smaller first). `next()` invokes the next interceptor or the handler. Use built-in `RequestContext` keys (`Request`, `Endpoint`, `Controller`, `Params`) to access request data.

Use `@Priority(Interceptor.EXCEPTION)` to place an interceptor at the exception-handling stage. Fine-tune with `+1`/`-1` if needed, but avoid unless necessary.

Interceptors can:
- Short-circuit: `throw new HttpException(401)` or return without calling `next()`
- Modify request state: `CurrentUser.set(authUser)`
- Transform response: `const res = await next(); return transform(res);`

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class LoggingInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const start = Date.now();
        try {
            return await next();
        } finally {
            console.log(`${Request.getOrThrow().method} ${Request.getOrThrow().url} ${Date.now() - start}ms`);
        }
    }
}
```

### Built-in: BasicAuthInterceptor

```ts
@Configuration('auth.basic')
class BasicAuthConfig {
    @IsString() username!: string;
    @IsString() password!: string;
    @IsString({ default: 'Restricted' }) realm!: string;
}

@Component()
@Priority(Interceptor.GUARD)
@Conditional((config = injectConfig(BasicAuthConfig, true)) => config !== undefined)
class BasicAuthInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(BasicAuthConfig)) { super(); }

    async intercept(next: () => unknown) {
        const auth = Request.getOrThrow().headers['authorization'];
        // parse Basic auth, compare, throw HttpException(401) on failure
        return next();
    }
}
```

## 6. Clients

### Route definitions (`@kavri/schema`)

Route contracts are defined in `@kavri/schema` using `defineRoute()` — see [09-schema-design.md](./09-schema-design.md#7-service-definitions-protobuf-style). Shared between frontend and backend.

### createClient (`@kavri/client`)

```ts
import { createClient } from '@kavri/client';
const client = createClient(UserRoute, { baseUrl: 'https://api.example.com' });
const user = await client.getUser({ id: 123 });
```

### injectClient (`@kavri/client`)

Server-side typed client for service-to-service calls:

```ts
import { injectClient } from '@kavri/client';

@Component()
class PaymentService {
    constructor(private readonly orders = injectClient(OrderRoute)) {}

    async refund(orderId: number) {
        const order = await this.orders.getOrder({ id: orderId });
    }
}
```

`injectClient()` is an inject point. Base URL from configuration or service discovery.

## 7. OpenAPI Generation

See [09-schema-design.md](./09-schema-design.md#openapi-generation). `generateOpenAPI(route, options)` in `@kavri/schema` generates OpenAPI 3.x from route definitions. Static — no running container needed.

## 8. Static Assets

```ts
@Configuration('static')
class StaticConfig {
    @IsString({ default: './public' }) root!: string;
    @IsString({ default: '/static' }) prefix!: string;
}

@Component()
@Priority(Interceptor.ROUTE - 1)
@Conditional((config = injectConfig(StaticConfig, true)) => config !== undefined)
class StaticFileInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(StaticConfig)) { super(); }

    async intercept(next: () => unknown) {
        const url = Request.getOrThrow().url ?? '';
        if (url.startsWith(this.config.prefix)) {
            const filePath = resolve(this.config.root, url.slice(this.config.prefix.length));
            return new FileResponse(filePath);
        }
        return next();
    }
}
```

## 9. Database Transactions (Drizzle + AsyncLocalStorage)

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

const txStorage = new AsyncLocalStorage<DrizzleTransaction>();

function Transactional(): MethodDecorator<{}> {
    return createMethodDecorator(Transactional, {});
}

@Component()
@Priority(Interceptor.HANDLER - 1)
class TransactionInterceptor extends Interceptor {
    constructor(private readonly db = inject(DrizzleDatabase)) { super(); }

    async intercept(next: () => unknown) {
        const ctrl = Controller.get();
        const endpoint = Endpoint.get();
        const isTx = ctrl && endpoint && Metadata.of(Transactional, ctrl.constructor, endpoint.path).length > 0;
        if (isTx) {
            return this.db.transaction((tx) => txStorage.run(tx, next));
        }
        return next();
    }
}

@Component()
abstract class Repository<T> {
    constructor(private readonly db = inject(DrizzleDatabase)) {}

    protected get connection() {
        return txStorage.getStore() ?? this.db;
    }
}
```

Usage — `@Transactional()` on a controller method:

```ts
@Controller()
class OrderController extends createController(OrderRoute) {
    constructor(private readonly orderRepo = inject(OrderRepository)) { super(); }

    @Transactional()
    override async createOrder(input: CreateOrderBody): Promise<OrderResponse> {
        return this.orderRepo.create(input);
    }
}
```

## 10. Configuration

```ts
@Configuration('http')
class HttpConfig {
    @IsString({ default: '0.0.0.0' }) host!: string;
    @IsInteger({ default: 3000 }) port!: number;
}

@Configuration('database')
class DatabaseConfig {
    @IsString() url!: string;
    @IsInteger({ default: 2 }) poolMin!: number;
    @IsInteger({ default: 10 }) poolMax!: number;
}
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
@Priority(Interceptor.EXCEPTION)
class ErrorInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
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
@Component()
class WebApplication {
    constructor(
        // Inject all interceptors sorted by priority — all must have @Priority
        private readonly interceptors = injectAll(Interceptor, 'priority'),
        private readonly config = injectConfig(HttpConfig),
    ) {
        // Validate: every Interceptor subclass MUST have @Priority
        for (const interceptor of this.interceptors) {
            const priority = Metadata.of(Priority, interceptor.constructor);
            if (priority.length === 0) {
                throw new Error(
                    `Interceptor ${interceptor.constructor.name} is missing @Priority(). `
                    + `All interceptors must declare their priority.`
                );
            }
        }
    }

    /** Create and resolve the application. */
    static async create(entrypoint: AnyConstructor<any>): Promise<WebApplication> {
        const container = new Container();
        return container.resolve(WebApplication, [entrypoint]);
    }

    /** Start HTTP server. */
    async start(): Promise<void> {
        const server = http.createServer(this.toHandler());
        server.listen(this.config.port, this.config.host);
    }

    /** Return raw Node.js HTTP handler. */
    toHandler(): (req: IncomingMessage, res: ServerResponse) => void {
        return (req, res) => {
            RequestContext.run(async () => {
                Request.set(req);
                Response.set(res);

                const chain = this.buildChain(this.interceptors, 0);
                await chain();
            }).catch(err => {
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });
        };
    }

    private buildChain(interceptors: readonly Interceptor[], index: number): () => unknown {
        if (index >= interceptors.length) {
            return () => { throw new HttpException(404, 'Not Found'); };
        }
        return () => interceptors[index].intercept(this.buildChain(interceptors, index + 1));
    }
}
```

### Bootstrap

```ts
@Component()
@Touch(UserController, OrderController)
@Touch(LoggingInterceptor, TransactionInterceptor, BasicAuthInterceptor)
@Use(InfraModule)
class MyApplication {}

const app = await WebApplication.create(MyApplication);
await app.start();

// Or: manual handler
// const handler = app.toHandler();
// http.createServer(handler).listen(3000);
```

## 13. Built-in Interceptors

All built-in interceptors are registered by the framework automatically. Users `@Touch` their own interceptors to insert into the chain.

### ResponseInterceptor (RESPONSE = 0)

The outermost interceptor. Awaits the result from the entire downstream chain and writes it to the HTTP response.

```ts
@Component()
@Priority(Interceptor.RESPONSE)
class ResponseInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const res = Response.getOrThrow();
        const result = await next();

        // If response already written (e.g., static file interceptor piped directly), skip
        if (res.headersSent) return;

        if (result instanceof Redirect) {
            res.writeHead(result.status ?? 302, { Location: result.url });
            res.end();
        } else if (result instanceof FileResponse) {
            res.writeHead(200, { 'Content-Type': result.contentType ?? 'application/octet-stream' });
            createReadStream(result.path).pipe(res);
        } else if (result instanceof StreamResponse) {
            res.writeHead(200, { 'Content-Type': result.contentType });
            Readable.fromWeb(result.stream).pipe(res);
        } else if (result instanceof RawResponse) {
            res.writeHead(result.status, result.headers);
            res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
        } else if (result !== undefined) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } else {
            res.writeHead(204);
            res.end();
        }
    }
}
```

### ExceptionInterceptor (EXCEPTION = 2000)

Catches errors from downstream interceptors and maps them to HTTP responses.

```ts
@Component()
@Priority(Interceptor.EXCEPTION)
class ExceptionInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        try {
            return await next();
        } catch (err) {
            if (err instanceof HttpException) {
                return new RawResponse(
                    err.status,
                    { 'Content-Type': 'application/json', ...err.headers },
                    JSON.stringify({ status: err.status, message: err.message }),
                );
            }
            // Unknown error → 500, hide message in production
            const message = process.env.NODE_ENV === 'production'
                ? 'Internal Server Error'
                : (err as Error).message;
            return new RawResponse(500,
                { 'Content-Type': 'application/json' },
                JSON.stringify({ status: 500, message }),
            );
        }
    }
}
```

### RouteInterceptor (ROUTE = 3000)

Matches the request URL against registered routes. Sets `Endpoint`, `Controller`, `PathParams`.

```ts
@Component()
@Priority(Interceptor.ROUTE)
class RouteInterceptor extends Interceptor {
    // Router is built at startup from all @Controller classes' route metadata
    private router: Router;

    @OnConstruct()
    init() {
        // Collect all controllers, read their route definitions via Metadata
        const controllers = injectAll(Controller);
        this.router = new Router();
        for (const ctrl of controllers) {
            const route = Metadata.of(Controller, ctrl); // → RouteDefinition
            for (const [name, endpoint] of Object.entries(route.endpoints)) {
                const fullPath = route.basePath + endpoint.path;
                this.router.add(endpoint.method, fullPath, { ctrl, name, endpoint });
            }
        }
    }

    async intercept(next: () => unknown) {
        const req = Request.getOrThrow();
        const match = this.router.match(req.method!, req.url!);

        if (match) {
            Endpoint.set(match.endpoint);
            Controller.set(match.ctrl);
            PathParams.set(match.params);
        } else {
            Endpoint.set(null);
            Controller.set(null);
            PathParams.set({});
        }

        return next();
    }
}
```

### ParseInterceptor (PARSE = 6000)

Parses the request URL query string and body based on the endpoint's `requestType`.

```ts
@Component()
@Priority(Interceptor.PARSE)
class ParseInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const req = Request.getOrThrow();
        const endpoint = Endpoint.get();

        // Parse query string
        const url = new URL(req.url!, `http://${req.headers.host}`);
        Query.set(Object.fromEntries(url.searchParams));

        if (!endpoint || endpoint.request === 'void') {
            Body.set(undefined);
            Files.set({});
            return next();
        }

        const requestType = endpoint.options.requestType ?? 'data';

        if (requestType === 'data') {
            // Read body, parse as JSON
            const raw = await readBody(req);
            Body.set(JSON.parse(raw));
        } else if (requestType === 'multipart') {
            // Parse multipart/form-data → fields + files
            const { fields, files } = await parseMultipart(req, endpoint.options.multipart!);
            Body.set(fields);
            Files.set(files);
        } else if (requestType === 'binary') {
            // Raw stream — body is the request stream itself
            Body.set(req);  // IncomingMessage is a ReadableStream
        }

        return next();
    }
}
```

### ResolveInterceptor (RESOLVE = 7000)

Merges raw pieces (PathParams, Query, Body, Files) into a single object matching the request schema shape. Sets `Params`.

```ts
@Component()
@Priority(Interceptor.RESOLVE)
class ResolveInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const endpoint = Endpoint.get();
        if (!endpoint || endpoint.request === 'void') {
            Params.set(undefined);
            return next();
        }

        const pathParams = PathParams.get() ?? {};
        const query = Query.get() ?? {};
        const body = Body.get();
        const files = Files.get() ?? {};

        // Merge: path params + query + body fields + files
        // Path params and query are always merged.
        // Body is spread if it's an object, otherwise set as-is.
        // Files are merged by field name.
        const merged: Record<string, any> = { ...pathParams, ...query };

        if (body && typeof body === 'object' && !(body instanceof ReadableStream)) {
            Object.assign(merged, body);
        } else if (body !== undefined) {
            // Binary body — find the @IsBody() field and assign
            merged['body'] = body;
        }

        // Merge files into their corresponding fields
        for (const [fieldName, fileOrFiles] of Object.entries(files)) {
            merged[fieldName] = fileOrFiles;
        }

        Params.set(merged);
        return next();
    }
}
```

### ValidateInterceptor (VALIDATE = 8000)

Validates `Params` against the endpoint's request schema. Throws `HttpException(400)` on failure.

```ts
@Component()
@Priority(Interceptor.VALIDATE)
class ValidateInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const endpoint = Endpoint.get();
        if (!endpoint || endpoint.request === 'void') {
            return next();
        }

        const params = Params.get();
        const requestClass = endpoint.request as AnyConstructor<any>;

        // Validate and parse using @kavri/schema
        const error = validate(requestClass, params);
        if (error) {
            throw new HttpException(400, 'Validation failed', {
                'Content-Type': 'application/json',
            });
            // Body: { status: 400, message: 'Validation failed', issues: error.issues }
        }

        // Parse into typed instance (applies custom parsers like @IsDate)
        const parsed = parse(requestClass, params);
        Params.set(parsed);

        return next();
    }
}
```

### HandlerInterceptor (HANDLER = 9000)

Calls the matched controller method with the validated params. Validates the response if a response schema exists.

```ts
@Component()
@Priority(Interceptor.HANDLER)
class HandlerInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const endpoint = Endpoint.get();
        const ctrl = Controller.get();

        if (!endpoint || !ctrl) {
            throw new HttpException(404, 'Not Found');
        }

        // Find the method name on the controller that matches this endpoint
        const methodName = /* resolved from endpoint name */;
        const handler = (ctrl as any)[methodName];

        if (typeof handler !== 'function') {
            throw new HttpException(500, `Handler method ${String(methodName)} not found`);
        }

        // Call handler with parsed params (or no args if void)
        const params = Params.get();
        const result = endpoint.request === 'void'
            ? await handler.call(ctrl)
            : await handler.call(ctrl, params);

        // Validate response if schema exists
        if (endpoint.response !== 'void' && endpoint.response !== 'stream' && result !== undefined) {
            const responseClass = endpoint.response as AnyConstructor<any>;
            const error = validate(responseClass, result);
            if (error) {
                throw new HttpException(500, 'Response validation failed');
            }
        }

        return result;
    }
}
```

### Pipeline summary

```
Request
  │
  ▼
ResponseInterceptor (1000)       ← writes result to HTTP response
  │
  ▼
[LoggingInterceptor (2000)]      ← user-provided
  │
  ▼
ExceptionInterceptor (3000)      ← catches errors → RawResponse
  │
  ▼
RouteInterceptor (4000)          ← sets Endpoint, Controller, PathParams
  │
  ▼
[CorsInterceptor (5000)]         ← user-provided
  │
  ▼
[AuthInterceptor (6000)]         ← user-provided
  │
  ▼
ParseInterceptor (7000)          ← sets Query, Body, Files
  │
  ▼
ResolveInterceptor (8000)        ← merges → sets Params
  │
  ▼
ValidateInterceptor (9000)       ← validates Params, throws 400
  │
  ▼
[TransactionInterceptor (9999)]  ← user-provided
  │
  ▼
HandlerInterceptor (10000)       ← calls controller method, returns result
  │
  ▼
(result bubbles back up through the chain to ResponseInterceptor)
```

## 13. Full Example

```ts
import {
    Schema, IsString, IsInteger, IsEmail, defineRoute, get, post, del,
} from '@kavri/schema';
import {
    Controller, createController,
    Interceptor, RequestContext, HttpException, WebApplication,
} from '@kavri/web';
import { Component, Touch, inject } from '@kavri/core';

// ---- Route definition (shared with frontend) ----

@Schema()
class GetUserParams {
    @IsInteger({ min: 1 }) id!: number;
}

@Schema()
class CreateUserBody {
    @IsString({ minLength: 1 }) name!: string;
    @IsEmail() email!: string;
}

@Schema()
class UserResponse {
    @IsInteger() id!: number;
    @IsString() name!: string;
    @IsEmail() email!: string;
}

const UserRoute = defineRoute('UserRoute', '/user', {
    getUser: get(GetUserParams, UserResponse, '/:id'),
    createUser: post(CreateUserBody, UserResponse),
    deleteUser: del(GetUserParams, 'void', '/:id'),
});

// ---- Controller ----

@Controller()
class UserController extends createController(UserRoute) {
    constructor(private readonly repo = inject(UserRepository)) { super(); }

    override async getUser(input: GetUserParams) {
        const user = await this.repo.findById(input.id);
        if (!user) throw new HttpException(404, 'User not found');
        return user;
    }

    override async createUser(input: CreateUserBody) {
        return this.repo.create(input);
    }

    override async deleteUser(input: GetUserParams) {
        await this.repo.delete(input.id);
    }
}

// ---- Interceptor ----

@Component()
@Priority(Interceptor.GUARD)
class AuthInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const token = Request.getOrThrow().headers['authorization'];
        if (!token) throw new HttpException(401);
        CurrentUser.set(verifyToken(token));
        return next();
    }
}

// ---- Bootstrap ----

@Component()
@Touch(UserController)
@Touch(AuthInterceptor)
class MyApp {}

const app = await WebApplication.create(MyApp);
await app.start();
```

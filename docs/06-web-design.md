# Web Module Design

## 1. Principles

- **Framework-independent.** Core design has no dependency on Express, Fastify, etc. The web module produces a standard `(req, res) => void` handler usable with `node:http`, Bun, Deno, or any adapter.
- **Parsed input only.** Handlers receive validated, typed data — not raw streams. Body parsing happens before handlers and interceptors see the request (gRPC-style).
- **Single interception mechanism.** Interceptors replace middleware, guards, pipes, and filters. One abstraction, one chain.
- **Controllers are singletons.** Per-request data lives in `AsyncContext` — a typed key-value store backed by `AsyncLocalStorage` (from `@kavri/basic`).
- **Route-first.** All endpoints are defined via `defineRoute()` in `@kavri/schema`. Controllers implement routes via `@Controller(route)` + `implements ControllerType<typeof route>`.

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

## 3. AsyncContext & Request Keys

`AsyncContext` and `Key<T>` live in `@kavri/basic` (see [05-metadata-design.md](./05-metadata-design.md#8-asynccontext)). The web module defines keys and uses `AsyncContext.run()`/`AsyncContext.fork()` for per-request scoping.

### Built-in request keys

The framework sets these during request processing:

```ts
import { IncomingMessage, ServerResponse } from 'node:http';

// --- Set by framework at request start ---

/** The raw Node.js request. */
const kRequest = AsyncContext.key<IncomingMessage>('request');

/** The raw Node.js response. */
const kResponse = AsyncContext.key<ServerResponse>('response');

/** Parsed URL of the request. */
const kURL = AsyncContext.key<URL>('url');

// --- Set by ROUTE stage ---

/** The matched endpoint metadata from defineRoute. Null if no route matched. */
const kEndpoint = AsyncContext.key<Endpoint<any, any> | null>('endpoint');

/** The matched controller instance. Null if no route matched. */
const kController = AsyncContext.key<object | null>('controller');

// --- Set by PARSE stage (raw pieces) ---

/** Path parameters extracted by the router. */
const kPathParams = AsyncContext.key<Record<string, string>>('pathParams');

/** Query string parameters. */
const kQuery = AsyncContext.key<Record<string, string>>('query');

/** Parsed request body (JSON object, string, etc.). */
const kBody = AsyncContext.key<unknown>('body');

/** Uploaded files (multipart requests only). */
const kFiles = AsyncContext.key<Record<string, MultipartFile | MultipartFile[]>>('files');

// --- Set by RESOLVE stage (merged) ---

/** Final merged params: path params + query + body + files, shaped to request schema. */
const kParams = AsyncContext.key<unknown>('params');

// --- For logging (from @kavri/logging integration) ---

/** Request-scoped logging context. Interceptors append data here. */
const kLogging = AsyncContext.key<Record<string, unknown>>('logging');
```

### Usage

```ts
// Read built-in request data
const req = kRequest.getOrThrow();
const params = kParams.get();

// Custom keys for interceptor → handler communication
const CurrentUser = AsyncContext.key<User>('currentUser');

// In interceptor:
CurrentUser.set(authenticatedUser);

// In handler:
const user = CurrentUser.getOrThrow();
```

## 4. Controllers

Controllers are the sole mechanism for implementing HTTP endpoints. Every controller implements a route definition from `@kavri/schema`.

### @Controller(route) + ControllerType

```ts
/**
 * ControllerType maps a RouteDefinition's endpoints to handler method signatures.
 * For each endpoint key K:
 *   request = 'void' → K(): Awaitable<ResponseType>
 *   request = class  → K(input: InstanceType<request>): Awaitable<ResponseType>
 */
type ControllerType<T extends RouteDefinition<any>> = {
    [K in keyof T['endpoints']]: /* typed handler method */
};
```

```ts
import { Controller, ControllerType } from '@kavri/web';
import { UserRoute } from './user-route';

@Controller(UserRoute)
class UserController implements ControllerType<typeof UserRoute> {
    constructor(private readonly repo = inject(UserRepository)) {}

    async getUser(input: GetUserParams): Promise<UserResponse> {
        return this.repo.findById(input.id);
    }

    async createUser(input: CreateUserBody): Promise<UserResponse> {
        const userId = CurrentUser.getOrThrow().id;
        return this.repo.create({ ...input, createdBy: userId });
    }

    async deleteUser(input: GetUserParams): Promise<void> {
        await this.repo.delete(input.id);
    }
}
```

- `@Controller(route)` composes `@Component()` and registers all routing metadata from the route definition.
- `implements ControllerType<typeof route>` enforces that all endpoint methods are implemented with correct types. No `extends`/`override`/`super()` needed.
- Handlers receive parsed input. Return typed response or a special response object (`Redirect`, `FileResponse`, etc.).
- Access per-request data via `Key.get()` / `Key.getOrThrow()`.
- **Controllers should never be injected by application code.** They are discovered by the framework via `Metadata.entries(Controller)`.

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

Interceptors are `@Component()` classes extending `Interceptor`. Discovered via `injectAll(Interceptor, 'priority')`. Sorted by `@Priority` value (smaller first). `next()` invokes the next interceptor or the handler. Use built-in keys (`kRequest`, `kEndpoint`, `kController`, `kParams`) to access request data.

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
            console.log(`${kRequest.getOrThrow().method} ${kRequest.getOrThrow().url} ${Date.now() - start}ms`);
        }
    }
}
```

### Built-in: BasicAuthInterceptor

```ts
@Configuration('kavri.web.auth.basic')
class BasicAuthConfig {
    @IsString() username!: string;
    @IsString() password!: string;
    @IsString({ default: 'Restricted' }) realm!: string;
}

@Component()
@Priority(Interceptor.GUARD)
@ConditionalOnConfiguration(BasicAuthConfig)
class BasicAuthInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(BasicAuthConfig)) { super(); }

    async intercept(next: () => unknown) {
        const auth = kRequest.getOrThrow().headers['authorization'];
        // parse Basic auth, compare, throw HttpException(401) on failure
        return next();
    }
}
```

### Built-in: CompressionInterceptor

Uses [`expressjs/compression`](https://github.com/expressjs/compression) (peer dependency) to transparently compress responses. Works by wrapping the raw `res` before downstream interceptors write to it — compression happens at the stream level, handling all response types (JSON, streams, files) automatically.

```ts
@Configuration('kavri.web.compression')
class CompressionConfig {
    /** Minimum response size in bytes to compress. Default 1KB. */
    @IsInteger({ default: 1024 }) threshold!: number;
    /** Compression level (zlib). -1 = default, 0 = none, 9 = best. */
    @IsInteger({ default: -1 }) level!: number;
    /** Custom filter: return true to compress. Default: compression's built-in filter. */
    // filter?: (req, res) => boolean;  — set programmatically, not via config
}

@Component()
@Priority(Interceptor.RESPONSE + 1)
@ConditionalOnConfiguration(CompressionConfig)
class CompressionInterceptor extends Interceptor {
    private compress!: ReturnType<typeof compression>;

    constructor(private readonly config = injectConfig(CompressionConfig)) { super(); }

    @OnConstruct()
    init() {
        this.compress = compression({
            threshold: this.config.threshold,
            level: this.config.level,
        });
    }

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const res = kResponse.getOrThrow();

        // Wrap res with compression before downstream writes to it
        await new Promise<void>((resolve, reject) => {
            this.compress(req, res, (err?: Error) => err ? reject(err) : resolve());
        });

        return next();
    }
}
```

### Built-in: CorsInterceptor

```ts
@Configuration('kavri.web.cors')
class CorsConfig {
    /** Allowed origins. '*' for all. */
    @IsArray(IsString(), { default: ['*'] }) origins!: string[];
    /** Allowed HTTP methods. */
    @IsArray(IsString(), { default: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] }) methods!: string[];
    /** Allowed request headers. */
    @IsArray(IsString(), { default: ['Content-Type', 'Authorization'] }) allowedHeaders!: string[];
    /** Headers exposed to the client. */
    @IsArray(IsString(), { optional: true }) exposedHeaders?: string[];
    /** Allow credentials (cookies, auth headers). */
    @IsBoolean({ default: false }) credentials!: boolean;
    /** Preflight cache duration in seconds. */
    @IsInteger({ default: 86400 }) maxAge!: number;
}

@Component()
@Priority(Interceptor.CORS)
@ConditionalOnConfiguration(CorsConfig)
class CorsInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(CorsConfig)) { super(); }

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const res = kResponse.getOrThrow();
        const origin = req.headers['origin'];

        if (!origin) return next();

        if (!this.isAllowed(origin)) {
            throw new HttpException(403, 'Origin not allowed');
        }

        res.setHeader('Access-Control-Allow-Origin', this.config.origins.includes('*') ? '*' : origin);
        if (this.config.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (this.config.exposedHeaders?.length) {
            res.setHeader('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '));
        }

        // Preflight
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', this.config.methods.join(', '));
            res.setHeader('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
            res.setHeader('Access-Control-Max-Age', String(this.config.maxAge));
            return new RawResponse(204, {}, '');
        }

        return next();
    }

    private isAllowed(origin: string): boolean {
        if (this.config.origins.includes('*')) return true;
        return this.config.origins.includes(origin);
    }
}
```

### Built-in: RateLimitInterceptor

Token-bucket rate limiter. Keyed by client IP by default. Configurable key extraction.

```ts
@Configuration('kavri.web.rateLimit')
class RateLimitConfig {
    /** Max requests per window. */
    @IsInteger({ default: 100 }) max!: number;
    /** Window size in milliseconds. */
    @IsInteger({ default: 60_000 }) window!: number;
    /** Response headers to include (X-RateLimit-*). */
    @IsBoolean({ default: true }) headers!: boolean;
}

/**
 * Abstract. Subclasses provide storage for rate limit counters.
 * Built-in: MemoryRateLimitStore. Users can provide Redis-backed, etc.
 */
abstract class RateLimitStore {
    /** Increment counter for key. Returns { count, resetAt }. */
    abstract increment(key: string, windowMs: number): Awaitable<{ count: number; resetAt: number }>;
}

@Component()
class MemoryRateLimitStore extends RateLimitStore {
    private buckets = new Map<string, { count: number; resetAt: number }>();

    increment(key: string, windowMs: number): { count: number; resetAt: number } {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            this.buckets.set(key, bucket);
        }
        bucket.count++;
        return bucket;
    }
}

@Component()
@Priority(Interceptor.GUARD - 2)
@ConditionalOnConfiguration(RateLimitConfig)
class RateLimitInterceptor extends Interceptor {
    constructor(
        private readonly config = injectConfig(RateLimitConfig),
        private readonly store = inject(RateLimitStore),
    ) { super(); }

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const res = kResponse.getOrThrow();
        const key = req.socket.remoteAddress ?? 'unknown';

        const { count, resetAt } = await this.store.increment(key, this.config.window);

        if (this.config.headers) {
            res.setHeader('X-RateLimit-Limit', String(this.config.max));
            res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.config.max - count)));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
        }

        if (count > this.config.max) {
            throw new HttpException(429, 'Too Many Requests', {
                'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
            });
        }

        return next();
    }
}
```

### Built-in: CsrfInterceptor

Double-submit cookie pattern. Stateless — no server-side token storage.

The cookie is **not** `HttpOnly` — frontend JS must read it to echo in the request header. Security relies on same-origin policy: an attacker on a different origin can cause the browser to send the cookie, but can't read its value to set the header.

CSRF check applies to all HTTP methods when:
1. The request matches a controller action that is **not** decorated with `@NoCsrf()`, OR
2. The request path matches one of `CsrfConfig.includes` (for non-action paths)

```ts
/**
 * Method decorator. Marks a controller action as exempt from CSRF validation.
 * Use for API endpoints that use token-based auth (Bearer), webhooks, etc.
 */
declare function NoCsrf(): MethodDecorator<{}>;
```

```ts
@Configuration('kavri.web.csrf')
class CsrfConfig {
    /** Cookie name for the CSRF token. Must be JS-readable (not HttpOnly). */
    @IsString({ default: '_csrf' }) cookie!: string;
    /** Header name the client must echo the token in. */
    @IsString({ default: 'x-csrf-token' }) header!: string;
    /** Extra path prefixes to protect (for paths that don't match a controller action). */
    @IsArray(IsString(), { optional: true }) includes?: string[];
}

@Component()
@Priority(Interceptor.GUARD - 1)
@ConditionalOnConfiguration(CsrfConfig)
class CsrfInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(CsrfConfig)) { super(); }

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const res = kResponse.getOrThrow();

        // Set CSRF cookie on every response if not present.
        // NOT HttpOnly — frontend must read it via document.cookie.
        const cookies = parseCookies(req.headers['cookie'] ?? '');
        let token = cookies[this.config.cookie];
        if (!token) {
            token = crypto.randomUUID();
            res.setHeader('Set-Cookie',
                `${this.config.cookie}=${token}; Path=/; SameSite=Strict`);
        }

        if (this.requiresCheck(req)) {
            const headerToken = req.headers[this.config.header.toLowerCase()];
            if (!headerToken || headerToken !== token) {
                throw new HttpException(403, 'CSRF token mismatch');
            }
        }

        return next();
    }

    private requiresCheck(req: IncomingMessage): boolean {
        const endpoint = kEndpoint.get();
        const ctrl = kController.get();

        if (endpoint && ctrl) {
            // Matched a controller action — check unless @NoCsrf
            const noCsrf = Metadata.of(NoCsrf, ctrl, endpoint.name);
            return noCsrf.length === 0;
        }

        // No action matched — check if path is in includes
        if (this.config.includes) {
            const url = req.url ?? '';
            return this.config.includes.some(prefix => url.startsWith(prefix));
        }

        return false;
    }
}
```

Usage:

```ts
@Controller(UserRoute)
class UserController implements ControllerType<typeof UserRoute> {
    // CSRF checked (default for state-changing actions)
    async createUser(input: CreateUserBody) { ... }

    // CSRF skipped — this endpoint uses Bearer token auth
    @NoCsrf()
    async apiCreateUser(input: CreateUserBody) { ... }
}
```

Frontend:
```ts
const token = document.cookie.match(/_csrf=([^;]+)/)?.[1];
fetch('/api/data', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    credentials: 'same-origin',
});
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

Uses [`expressjs/serve-static`](https://github.com/expressjs/serve-static) (peer dependency). Handles caching headers, range requests, directory index, etc.

```ts
@Configuration('kavri.web.static')
class StaticConfig {
    /** Root directory to serve files from. */
    @IsString({ default: './public' }) root!: string;
    /** URL prefix. */
    @IsString({ default: '/static' }) prefix!: string;
    /** Max-age Cache-Control header in milliseconds. */
    @IsInteger({ default: 0 }) maxAge!: number;
    /** Enable directory index (index.html). */
    @IsBoolean({ default: true }) index!: boolean;
}

@Component()
@Priority(Interceptor.ROUTE - 1)
@ConditionalOnConfiguration(StaticConfig)
class StaticFileInterceptor extends Interceptor {
    private serve!: ReturnType<typeof serveStatic>;

    constructor(private readonly config = injectConfig(StaticConfig)) { super(); }

    @OnConstruct()
    init() {
        this.serve = serveStatic(this.config.root, {
            maxAge: this.config.maxAge,
            index: this.config.index ? 'index.html' : false,
        });
    }

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const res = kResponse.getOrThrow();
        const url = req.url ?? '';

        if (!url.startsWith(this.config.prefix)) return next();

        // Strip prefix so serve-static resolves from root
        req.url = url.slice(this.config.prefix.length) || '/';

        const served = await new Promise<boolean>((resolve) => {
            this.serve(req, res, () => resolve(false));
            res.on('finish', () => resolve(true));
        });

        req.url = url;  // restore original URL
        if (served) return;  // serve-static already wrote the response
        return next();
    }
}
```

## 9. Transactions

See [11-transaction-design.md](./11-transaction-design.md). `@Transactional()`, `TransactionManager`, `DataSourceDriver`, `DataSourceManager` — all in `@kavri/web`. ORM drivers in `@kavri/drizzle` and `@kavri/sequelize`.

## 10. WebSocket

See [13-websocket-design.md](./13-websocket-design.md). `defineWebSocket()`, `@WebSocketHandler(protocol)`, `WebSocketHandlerBase`, `HandlerType`, `ConnectionHub`, `WebSocketCodec`.

## 11. Configuration

```ts
@Configuration('kavri.web')
class WebConfig {
    @IsString({ default: '0.0.0.0' }) host!: string;
    @IsInteger({ default: 3000 }) port!: number;
    /** Global max request body size in bytes. Default 1MB. Endpoint-level limits override this. */
    @IsInteger({ default: 1_048_576 }) maxBodySize!: number;
    /** Graceful shutdown timeout in milliseconds. Default 30s. */
    @IsInteger({ default: 30_000 }) shutdownTimeout!: number;
}

@Configuration('database')
class DatabaseConfig {
    @IsString() url!: string;
    @IsInteger({ default: 2 }) poolMin!: number;
    @IsInteger({ default: 10 }) poolMax!: number;
}
```

## 12. Error Handling

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

## 13. Application Startup

```ts
@Component()
@Touch(ResponseInterceptor, ExceptionInterceptor, RouteInterceptor,
       QueryParseInterceptor, JsonParseInterceptor, UrlencodedParseInterceptor,
       MultipartParseInterceptor, BinaryParseInterceptor,
       ResolveInterceptor, ValidateInterceptor, HandlerInterceptor,
       WebLoggingInterceptor)
class WebApplication {
    constructor(
        // Inject all interceptors sorted by priority — all must have @Priority
        private readonly interceptors = injectAll(Interceptor, 'priority'),
        private readonly config = injectConfig(WebConfig),
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

    private server?: http.Server;
    private connections = new Set<net.Socket>();

    /** Create and resolve the application. */
    static async create(entrypoint: AnyConstructor<any>): Promise<WebApplication> {
        const container = new Container();
        return container.resolve(WebApplication, [entrypoint]);
    }

    /** Start HTTP server. */
    async start(): Promise<void> {
        this.server = http.createServer(this.toHandler());

        // Track connections for graceful shutdown
        this.server.on('connection', (socket) => {
            this.connections.add(socket);
            socket.on('close', () => this.connections.delete(socket));
        });

        this.server.listen(this.config.port, this.config.host);
    }

    /**
     * Graceful shutdown.
     * 1. Stop accepting new connections.
     * 2. Wait for in-flight requests to complete (up to shutdownTimeout).
     * 3. Force-close remaining connections after timeout.
     * 4. Run @OnDestroy lifecycle hooks via container.
     */
    async stop(): Promise<void> {
        if (!this.server) return;

        await new Promise<void>((resolve) => {
            this.server!.close(() => resolve());

            // Force-close idle connections immediately,
            // busy ones after timeout
            setTimeout(() => {
                for (const socket of this.connections) {
                    socket.destroy();
                }
            }, this.config.shutdownTimeout);
        });
    }

    /** Return raw Node.js HTTP handler. */
    toHandler(): (req: IncomingMessage, res: ServerResponse) => void {
        return (req, res) => {
            AsyncContext.run(async () => {
                kRequest.set(req);
                kResponse.set(res);
                kURL.set(new URL(req.url!, `http://${req.headers.host}`));

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
@Touch(LoggingInterceptor, BasicAuthInterceptor)
@Use(InfraModule)
class MyApplication {}

const app = await WebApplication.create(MyApplication);
await app.start();

// Or: manual handler
// const handler = app.toHandler();
// http.createServer(handler).listen(3000);
```

## 14. Built-in Interceptors

All built-in interceptors are registered by the framework automatically. Users `@Touch` their own interceptors to insert into the chain.

### ResponseInterceptor (RESPONSE = 0)

The outermost interceptor. Awaits the result from the entire downstream chain and writes it to the HTTP response.

```ts
@Component()
@Priority(Interceptor.RESPONSE)
class ResponseInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const res = kResponse.getOrThrow();
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
    init(controllers = injectAll(Controller)) {
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
        const req = kRequest.getOrThrow();
        const match = this.router.match(req.method!, req.url!);

        if (match) {
            kEndpoint.set(match.endpoint);
            kController.set(match.ctrl);
            kPathParams.set(match.params);
        } else {
            // Check if the path exists but method is wrong → 405
            const allowedMethods = this.router.getAllowedMethods(req.url!);
            if (allowedMethods.length > 0) {
                throw new HttpException(405, 'Method Not Allowed', {
                    'Allow': allowedMethods.join(', '),
                });
            }

            kEndpoint.set(null);
            kController.set(null);
            kPathParams.set({});
        }

        return next();
    }
}
```

### Parse Interceptors (PARSE = 7000)

Body parsing is split into specialized interceptors. Each handles one content type and skips if not applicable. All share the same priority — only one activates per request based on `Content-Type` and `requestType`.

```ts
/** Parses query string on every request. Always active. */
@Component()
@Priority(Interceptor.PARSE)
class QueryParseInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const url = kURL.getOrThrow();
        kQuery.set(Object.fromEntries(url.searchParams));
        return next();
    }
}

/** Parses JSON request bodies. Activates when Content-Type is application/json. */
@Component()
@Priority(Interceptor.PARSE + 1)
class JsonParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebConfig)) { super(); }

    async intercept(next: () => unknown) {
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') return next();

        const req = kRequest.getOrThrow();
        const contentType = req.headers['content-type'] ?? '';

        if (!contentType.includes('application/json')) return next();

        const maxBodySize = this.config.maxBodySize;
        const raw = await readBody(req, maxBodySize);
        kBody.set(JSON.parse(raw));
        return next();
    }
}

/** Parses URL-encoded form bodies. Activates when Content-Type is application/x-www-form-urlencoded. */
@Component()
@Priority(Interceptor.PARSE + 1)
class UrlencodedParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebConfig)) { super(); }

    async intercept(next: () => unknown) {
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') return next();

        const req = kRequest.getOrThrow();
        const contentType = req.headers['content-type'] ?? '';

        if (!contentType.includes('application/x-www-form-urlencoded')) return next();

        const maxBodySize = this.config.maxBodySize;
        const raw = await readBody(req, maxBodySize);
        kBody.set(Object.fromEntries(new URLSearchParams(raw)));
        return next();
    }
}

/** Parses multipart/form-data bodies. Activates when requestType is 'multipart'. */
@Component()
@Priority(Interceptor.PARSE + 1)
class MultipartParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebConfig)) { super(); }

    async intercept(next: () => unknown) {
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') return next();
        if ((endpoint.options.requestType ?? 'data') !== 'multipart') return next();

        const req = kRequest.getOrThrow();
        const maxBodySize = endpoint.options.multipart?.maxBodySize ?? this.config.maxBodySize;

        const { fields, files } = await parseMultipart(req, endpoint.options.multipart!, maxBodySize);
        kBody.set(fields);
        kFiles.set(files);
        return next();
    }
}

/** Passes the raw request stream as body. Activates when requestType is 'binary'. */
@Component()
@Priority(Interceptor.PARSE + 1)
class BinaryParseInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') return next();
        if ((endpoint.options.requestType ?? 'data') !== 'binary') return next();

        kBody.set(kRequest.getOrThrow());
        return next();
    }
}
```

Each interceptor is a `@Component()` — users can replace any parser by providing their own at the same priority with `@Conditional`.

### ResolveInterceptor (RESOLVE = 7000)

Merges raw pieces (PathParams, Query, Body, Files) into a single object matching the request schema shape. Sets `Params`.

```ts
@Component()
@Priority(Interceptor.RESOLVE)
class ResolveInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') {
            kParams.set(undefined);
            return next();
        }

        const pathParams = kPathParams.get() ?? {};
        const query = kQuery.get() ?? {};
        const body = kBody.get();
        const files = kFiles.get() ?? {};

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

        kParams.set(merged);
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
        const endpoint = kEndpoint.get();
        if (!endpoint || endpoint.request === 'void') {
            return next();
        }

        const params = kParams.get();
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
        kParams.set(parsed);

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
        const endpoint = kEndpoint.get();
        const ctrl = kController.get();

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
        const params = kParams.get();
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
CompressionInterceptor (1001)    ← compresses response body
  │
  ▼
[LoggingInterceptor (2000)]      ← user-provided
  │
  ▼
ExceptionInterceptor (3000)      ← catches errors → RawResponse
  │
  ▼
RouteInterceptor (4000)          ← sets Endpoint, Controller, PathParams; 405 on method mismatch
  │
  ▼
CorsInterceptor (5000)           ← CORS preflight, origin checks
  │
  ▼
RateLimitInterceptor (5998)      ← token-bucket rate limiting
  │
  ▼
CsrfInterceptor (5999)          ← double-submit cookie CSRF
  │
  ▼
[AuthInterceptor (6000)]         ← user-provided
  │
  ▼
QueryParseInterceptor (7000)     ← sets Query
JsonParseInterceptor (7001)      ← sets Body (application/json)
UrlencodedParseInterceptor (7001)← sets Body (application/x-www-form-urlencoded)
MultipartParseInterceptor (7001) ← sets Body + Files (multipart/form-data)
BinaryParseInterceptor (7001)    ← sets Body (raw stream)
  │
  ▼
ResolveInterceptor (8000)        ← merges → sets Params
  │
  ▼
ValidateInterceptor (9000)       ← validates Params, throws 400
  │
  ▼
HandlerInterceptor (10000)       ← calls controller method, returns result
  │
  ▼
(result bubbles back up through the chain to ResponseInterceptor)
```

## 15. Full Example

```ts
import {
    Schema, IsString, IsInteger, IsEmail, defineRoute, get, post, del,
} from '@kavri/schema';
import {
    Controller, ControllerType,
    Interceptor, HttpException, WebApplication,
} from '@kavri/web';
import { Component, Touch, inject } from '@kavri/container';

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

@Controller(UserRoute)
class UserController implements ControllerType<typeof UserRoute> {
    constructor(private readonly repo = inject(UserRepository)) {}

    async getUser(input: GetUserParams) {
        const user = await this.repo.findById(input.id);
        if (!user) throw new HttpException(404, 'User not found');
        return user;
    }

    async createUser(input: CreateUserBody) {
        return this.repo.create(input);
    }

    async deleteUser(input: GetUserParams) {
        await this.repo.delete(input.id);
    }
}

// ---- Interceptor ----

@Component()
@Priority(Interceptor.GUARD)
class AuthInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const token = kRequest.getOrThrow().headers['authorization'];
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

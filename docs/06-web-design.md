# Web Module Design

## 1. Principles

- **Framework-independent.** Core design has no dependency on Express, Fastify, etc. The web module produces a standard `(req, res) => void` handler usable with `node:http`, Bun, Deno, or any adapter.
- **Parsed input only.** Handlers receive validated, typed data — not raw streams. Body parsing happens before handlers and interceptors see the request (gRPC-style).
- **Single interception mechanism.** Interceptors replace middleware, guards, pipes, and filters. One abstraction, one chain.
- **Controllers are singletons.** Per-request data lives in `Context` — a typed key-value store from `@kavri/basic`.
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

## 3. RequestContext & Request Keys

`AsyncScope` and `Key<T>` live in `@kavri/basic`. The web module creates its own `RequestContext` instance and defines typed keys for request-scoped state. WebSocket connections also use `RequestContext` since upgrades are HTTP requests.

```ts
import { AsyncScope, Key } from '@kavri/basic';

/** Request-scoped async context for HTTP and WebSocket. */
export const RequestContext = new AsyncScope();
```

### Built-in request keys

```ts
import { IncomingMessage, ServerResponse } from 'node:http';

// --- Set by framework at request start ---

const REQUEST = Key.of<IncomingMessage>('request');
const RESPONSE = Key.of<ServerResponse>('response');
const URL = Key.of<URL>('url');

// --- Set by ROUTE stage ---

const ENDPOINT = Key.of<Endpoint<any, any> | null>('endpoint');
const CONTROLLER = Key.of<object | null>('controller');

// --- Set by PARSE stage (raw pieces) ---

const PATH_PARAMS = Key.of<Record<string, string>>('pathParams');
const QUERY = Key.of<Record<string, string>>('query');
const BODY = Key.of<unknown>('body');
const FILES = Key.of<Record<string, MultipartFile | MultipartFile[]>>('files');

// --- Set by RESOLVE stage (merged) ---

const PARAMS = Key.of<unknown>('params');

// --- For logging (from @kavri/logging integration) ---

const LOGGING = Key.of<Record<string, unknown>>('logging');
```

### Usage

```ts
// Read built-in request data
const req = ctx.getOrThrow(REQUEST);
const params = ctx.get(PARAMS);

// Custom keys for interceptor → handler communication
const CURRENT_USER = Key.of<User>('currentUser');

// In interceptor:
ctx.set(CURRENT_USER, authenticatedUser);

// In handler:
const user = ctx.getOrThrow(CURRENT_USER);
```

## 4. Controllers

Controllers are the sole mechanism for implementing HTTP endpoints. Every controller implements a route definition from `@kavri/schema`.

### @Controller(route) + ControllerType

```ts
/**
 * ControllerType maps a RouteDefinition's endpoints to handler method signatures.
 * For each endpoint key K:
 *   request = 'void' → K(ctx: Context): Awaitable<ResponseType>
 *   request = class  → K(input: InstanceType<request>, ctx: Context): Awaitable<ResponseType>
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

    async getUser(input: GetUserParams, ctx: Context): Promise<UserResponse> {
        return this.repo.findById(input.id);
    }

    async createUser(input: CreateUserBody, ctx: Context): Promise<UserResponse> {
        const userId = ctx.getOrThrow(CURRENT_USER).id;
        return this.repo.create({ ...input, createdBy: userId });
    }

    async deleteUser(input: GetUserParams, ctx: Context): Promise<void> {
        await this.repo.delete(input.id);
    }
}
```

- `@Controller(route)` composes `@Component()` and registers all routing metadata from the route definition.
- `implements ControllerType<typeof route>` enforces that all endpoint methods are implemented with correct types. No `extends`/`override`/`super()` needed.
- Handlers receive parsed input. Return typed response or a special response object (`Redirect`, `FileResponse`, etc.).
- Access per-request data via `ctx.get(key)` / `ctx.getOrThrow(key)`.
- **Controllers should never be injected by application code.** They are discovered by the framework via `Metadata.entries(Controller)`.

## 5. Interceptors

```ts
abstract class Interceptor {
    abstract intercept(ctx: Context, next: (ctx: Context) => unknown): Awaitable<unknown>;

    /** Priority anchors. Use with @Priority() to order interceptors.
     *  All Interceptor subclasses MUST have @Priority(). Enforced at startup. */
    static readonly RESPONSE  = 1000;   // write result to HTTP response
    static readonly BOOTSTRAP = 2000;   // logging, metrics, request ID
    static readonly EXCEPTION = 3000;   // error handling, error formatting
    static readonly ROUTE     = 4000;   // route matching
    static readonly CORS      = 5000;   // CORS preflight handling
    static readonly GUARD     = 6000;   // auth, rate limiting, RBAC
    static readonly PARSE     = 7000;   // decode raw body (JSON, multipart, binary)
    static readonly RESOLVE   = 8000;   // merge path params + query + body + files → Params
    static readonly VALIDATE  = 9000;   // validate Params against request schema
    static readonly ACTION    = 10000;  // controller action dispatch, WebSocket upgrade
    static readonly FALLBACK  = 11000;  // static files, catch-all
}
```

Interceptors are `@Component()` classes extending `Interceptor`. Discovered via `injectAll(Interceptor, 'priority')`. Sorted by `@Priority` value (smaller first). `next()` invokes the next interceptor or the handler. Use built-in keys (`REQUEST`, `ENDPOINT`, `CONTROLLER`, `PARAMS`) to access request data.

Use `@Priority(Interceptor.EXCEPTION)` to place an interceptor at the exception-handling stage. Fine-tune with `+1`/`-1` if needed, but avoid unless necessary.

Interceptors can:
- Short-circuit: `throw new HttpException(401)` or return without calling `next()`
- Modify request state: `ctx.set(CURRENT_USER, authUser)`
- Transform response: `const res = await next(ctx); return transform(res);`

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class LoggingInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const start = Date.now();
        try {
            return await next(ctx);
        } finally {
            console.log(`${ctx.getOrThrow(REQUEST).method} ${ctx.getOrThrow(REQUEST).url} ${Date.now() - start}ms`);
        }
    }
}
```

### Built-in: BasicAuthInterceptor

```ts
@Configuration('kavri.web.auth.basic')
class BasicAuthOptions {
    @IsString() username!: string;
    @IsString() password!: string;
    @IsString({ default: 'Restricted' }) realm!: string;
}

@Component()
@Priority(Interceptor.GUARD)
@ConditionalOnConfiguration(BasicAuthOptions)
class BasicAuthInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(BasicAuthOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const auth = ctx.getOrThrow(REQUEST).headers['authorization'];
        // parse Basic auth, compare, throw HttpException(401) on failure
        return next(ctx);
    }
}
```

### Built-in: CompressionInterceptor

Uses [`expressjs/compression`](https://github.com/expressjs/compression) (peer dependency) to transparently compress responses. Works by wrapping the raw `res` before downstream interceptors write to it — compression happens at the stream level, handling all response types (JSON, streams, files) automatically.

```ts
@Configuration('kavri.web.compression')
class CompressionOptions {
    /** Minimum response size in bytes to compress. Default 1KB. */
    @IsInteger({ default: 1024 }) threshold!: number;
    /** Compression level (zlib). -1 = default, 0 = none, 9 = best. */
    @IsInteger({ default: -1 }) level!: number;
    /** Custom filter: return true to compress. Default: compression's built-in filter. */
    // filter?: (req, res) => boolean;  — set programmatically, not via config
}

@Component()
@Priority(Interceptor.RESPONSE + 1)
@ConditionalOnConfiguration(CompressionOptions)
class CompressionInterceptor extends Interceptor {
    private compress!: ReturnType<typeof compression>;

    constructor(private readonly config = injectConfig(CompressionOptions)) { super(); }

    @OnConstruct()
    init() {
        this.compress = compression({
            threshold: this.config.threshold,
            level: this.config.level,
        });
    }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);

        // Wrap res with compression before downstream writes to it
        await new Promise<void>((resolve, reject) => {
            this.compress(req, res, (err?: Error) => err ? reject(err) : resolve());
        });

        return next(ctx);
    }
}
```

### Built-in: CorsInterceptor

```ts
@Configuration('kavri.web.cors')
class CorsOptions {
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
@ConditionalOnConfiguration(CorsOptions)
class CorsInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(CorsOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);
        const origin = req.headers['origin'];

        if (!origin) return next(ctx);

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

        return next(ctx);
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
class RateLimitOptions {
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
@ConditionalOnConfiguration(RateLimitOptions)
class RateLimitInterceptor extends Interceptor {
    constructor(
        private readonly config = injectConfig(RateLimitOptions),
        private readonly store = inject(RateLimitStore),
    ) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);
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

        return next(ctx);
    }
}
```

### Built-in: CsrfInterceptor

Double-submit cookie pattern. Stateless — no server-side token storage.

The cookie is **not** `HttpOnly` — frontend JS must read it to echo in the request header. Security relies on same-origin policy: an attacker on a different origin can cause the browser to send the cookie, but can't read its value to set the header.

CSRF check applies to all HTTP methods when:
1. The request matches a controller action that is **not** decorated with `@NoCsrf()`, OR
2. The request path matches one of `CsrfOptions.includes` (for non-action paths)

```ts
/**
 * Method decorator. Marks a controller action as exempt from CSRF validation.
 * Use for API endpoints that use token-based auth (Bearer), webhooks, etc.
 */
declare function NoCsrf(): MethodDecorator<{}>;
```

```ts
@Configuration('kavri.web.csrf')
class CsrfOptions {
    /** Cookie name for the CSRF token. Must be JS-readable (not HttpOnly). */
    @IsString({ default: '_csrf' }) cookie!: string;
    /** Header name the client must echo the token in. */
    @IsString({ default: 'x-csrf-token' }) header!: string;
    /** Extra path prefixes to protect (for paths that don't match a controller action). */
    @IsArray(IsString(), { optional: true }) includes?: string[];
}

@Component()
@Priority(Interceptor.GUARD - 1)
@ConditionalOnConfiguration(CsrfOptions)
class CsrfInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(CsrfOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);

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

        return next(ctx);
    }

    private requiresCheck(req: IncomingMessage): boolean {
        const endpoint = ctx.get(ENDPOINT);
        const ctrl = ctx.get(CONTROLLER);

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
    async createUser(input: CreateUserBody, ctx: Context) { ... }

    // CSRF skipped — this endpoint uses Bearer token auth
    @NoCsrf()
    async apiCreateUser(input: CreateUserBody, ctx: Context) { ... }
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
class StaticOptions {
    /** Root directory to serve files from. */
    @IsString({ default: './public' }) root!: string;
    /** URL prefix. Empty string means serve from root. */
    @IsString({ default: '' }) prefix!: string;

    // --- serve-static options ---

    /** Enable Accept-Ranges header. */
    @IsBoolean({ default: true }) acceptRanges!: boolean;
    /** Enable Cache-Control header. */
    @IsBoolean({ default: true }) cacheControl!: boolean;
    /** How to handle dotfiles: 'allow', 'deny', 'ignore'. */
    @IsIn(['allow', 'deny', 'ignore'] as const, { default: 'ignore' }) dotfiles!: string;
    /** Enable ETag generation. */
    @IsBoolean({ default: true }) etag!: boolean;
    /** File extensions to try when not provided (e.g., ['html']). false to disable. */
    @AnyOf([IsArray(IsString()), IsBoolean()], { default: false }) extensions!: string[] | false;
    /** Enable Cache-Control immutable directive. */
    @IsBoolean({ default: false }) immutable!: boolean;
    /** Directory index file(s). false to disable. */
    @AnyOf([IsString(), IsArray(IsString()), IsBoolean()], { default: 'index.html' })
    index!: string | string[] | false;
    /** Enable Last-Modified header. */
    @IsBoolean({ default: true }) lastModified!: boolean;
    /** Max-age Cache-Control header in milliseconds. */
    @IsInteger({ default: 0 }) maxAge!: number;
    /** Redirect to trailing '/' for directories. */
    @IsBoolean({ default: true }) redirect!: boolean;

    // --- SPA fallback ---

    /**
     * SPA fallback file path (relative to root). When set, serves this file
     * for any request that doesn't match a static file.
     * Typical value: 'index.html'.
     */
    @IsString({ optional: true }) fallback?: string;
}

@Component()
@Priority(Interceptor.FALLBACK)
@ConditionalOnConfiguration(StaticOptions)
class StaticFileInterceptor extends Interceptor {
    private serve!: ReturnType<typeof serveStatic>;

    constructor(private readonly config = injectConfig(StaticOptions)) { super(); }

    @OnConstruct()
    init() {
        this.serve = serveStatic(this.config.root, {
            acceptRanges: this.config.acceptRanges,
            cacheControl: this.config.cacheControl,
            dotfiles: this.config.dotfiles,
            etag: this.config.etag,
            extensions: this.config.extensions,
            fallthrough: true,  // always fallthrough — we handle miss ourselves
            immutable: this.config.immutable,
            index: this.config.index,
            lastModified: this.config.lastModified,
            maxAge: this.config.maxAge,
            redirect: this.config.redirect,
        });
    }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);
        const url = req.url ?? '';

        if (this.config.prefix && !url.startsWith(this.config.prefix)) return next(ctx);

        // Strip prefix so serve-static resolves from root
        if (this.config.prefix) {
            req.url = url.slice(this.config.prefix.length) || '/';
        }

        const served = await new Promise<boolean>((resolve) => {
            this.serve(req, res, () => resolve(false));
            res.on('finish', () => resolve(true));
        });

        if (this.config.prefix) req.url = url;  // restore original URL

        if (served) return;

        // SPA fallback: serve the fallback file for unmatched paths
        if (this.config.fallback) {
            const fallbackPath = resolve(this.config.root, this.config.fallback);
            return new FileResponse(fallbackPath, 'text/html');
        }

        return next(ctx);
    }
}
```

SPA config example:
```yaml
kavri:
  web:
    static:
      root: ./dist
      fallback: index.html   # all unmatched routes → index.html
      maxAge: 86400000        # 1 day for static assets
```

## 9. Transactions

See [11-transaction-design.md](./11-transaction-design.md). `@Transactional()`, `TransactionManager`, `DataSourceDriver`, `DataSourceManager` — all in `@kavri/web`. ORM drivers in `@kavri/drizzle` and `@kavri/sequelize`.

## 10. WebSocket

See [13-websocket-design.md](./13-websocket-design.md). `defineWebSocket()`, `@WebSocketHandler(protocol)`, `WebSocketHandlerBase`, `HandlerType`, `ConnectionHub`, `WebSocketCodec`.

## 11. Configuration

```ts
@Configuration('kavri.web')
class WebOptions {
    @IsString({ default: '0.0.0.0' }) host!: string;
    @IsInteger({ default: 3000 }) port!: number;
    /** Global max request body size in bytes. Default 1MB. Endpoint-level limits override this. */
    @IsInteger({ default: 1_048_576 }) maxBodySize!: number;
    /** Graceful shutdown timeout in milliseconds. Default 30s. */
    @IsInteger({ default: 30_000 }) shutdownTimeout!: number;
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
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        try {
            return await next(ctx);
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
       ResolveInterceptor, ValidateInterceptor,
       ActionInterceptor, WebSocketUpgradeInterceptor,
       WebLoggingInterceptor)
class WebApplication {
    constructor(
        // Inject all interceptors sorted by priority — all must have @Priority
        private readonly interceptors = injectAll(Interceptor, 'priority'),
        private readonly config = injectConfig(WebOptions),
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
            const ctx = RequestContext.create();
            ctx.set(REQUEST, req)
               .set(RESPONSE, res)
               .set(URL, new URL(req.url!, `http://${req.headers.host}`));

            const chain = this.buildChain(this.interceptors, 0);
            Promise.resolve(chain(ctx)).catch(err => {
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            });
        };
    }

    private buildChain(
        interceptors: readonly Interceptor[],
        index: number,
    ): (ctx: Context) => unknown {
        if (index >= interceptors.length) {
            return () => { throw new HttpException(404, 'Not Found'); };
        }
        return (ctx) => interceptors[index].intercept(
            ctx,
            this.buildChain(interceptors, index + 1),
        );
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
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const res = ctx.getOrThrow(RESPONSE);
        const result = await next(ctx);

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
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        try {
            return await next(ctx);
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

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const req = ctx.getOrThrow(REQUEST);
        const match = this.router.match(req.method!, req.url!);

        if (match) {
            ctx.set(ENDPOINT, match.endpoint);
            ctx.set(CONTROLLER, match.ctrl);
            ctx.set(PATH_PARAMS, match.params);
        } else {
            // Check if the path exists but method is wrong → 405
            const allowedMethods = this.router.getAllowedMethods(req.url!);
            if (allowedMethods.length > 0) {
                throw new HttpException(405, 'Method Not Allowed', {
                    'Allow': allowedMethods.join(', '),
                });
            }

            ctx.set(ENDPOINT, null);
            ctx.set(CONTROLLER, null);
            ctx.set(PATH_PARAMS, {});
        }

        return next(ctx);
    }
}
```

### Parse Interceptors (PARSE = 7000)

Body parsing is split into specialized interceptors. Each handles one content type and skips if not applicable. All share the same priority — only one activates per request based on `Content-Type` and `requestType`.

All parse interceptors are **passive** — if the target key is already set (by a user interceptor earlier in the chain), parsing is skipped. This allows custom parsing logic to take priority.

```ts
/** Parses query string. Skips if QUERY already set. */
@Component()
@Priority(Interceptor.PARSE)
class QueryParseInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        if (!ctx.has(QUERY)) {
            const url = ctx.getOrThrow(URL);
            ctx.set(QUERY, Object.fromEntries(url.searchParams));
        }
        return next(ctx);
    }
}

/** Parses JSON request bodies. Skips if BODY already set. */
@Component()
@Priority(Interceptor.PARSE + 1)
class JsonParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        if (ctx.has(BODY)) return next(ctx);

        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') return next(ctx);

        const req = ctx.getOrThrow(REQUEST);
        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.includes('application/json')) return next(ctx);

        const raw = await readBody(req, this.config.maxBodySize);
        ctx.set(BODY, JSON.parse(raw));
        return next(ctx);
    }
}

/** Parses URL-encoded form bodies. Skips if BODY already set. */
@Component()
@Priority(Interceptor.PARSE + 1)
class UrlencodedParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        if (ctx.has(BODY)) return next(ctx);

        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') return next(ctx);

        const req = ctx.getOrThrow(REQUEST);
        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.includes('application/x-www-form-urlencoded')) return next(ctx);

        const raw = await readBody(req, this.config.maxBodySize);
        ctx.set(BODY, Object.fromEntries(new URLSearchParams(raw)));
        return next(ctx);
    }
}

/** Parses multipart/form-data bodies. Skips if BODY already set. */
@Component()
@Priority(Interceptor.PARSE + 1)
class MultipartParseInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(WebOptions)) { super(); }

    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        if (ctx.has(BODY)) return next(ctx);

        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') return next(ctx);
        if ((endpoint.options.requestType ?? 'data') !== 'multipart') return next(ctx);

        const req = ctx.getOrThrow(REQUEST);
        const maxBodySize = endpoint.options.multipart?.maxBodySize ?? this.config.maxBodySize;

        const { fields, files } = await parseMultipart(req, endpoint.options.multipart!, maxBodySize);
        ctx.set(BODY, fields);
        ctx.set(FILES, files);
        return next(ctx);
    }
}

/** Passes the raw request stream as body. Skips if BODY already set. */
@Component()
@Priority(Interceptor.PARSE + 1)
class BinaryParseInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        if (ctx.has(BODY)) return next(ctx);

        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') return next(ctx);
        if ((endpoint.options.requestType ?? 'data') !== 'binary') return next(ctx);

        ctx.set(BODY, ctx.getOrThrow(REQUEST));
        return next(ctx);
    }
}
```

Each interceptor is a `@Component()` — users can replace any parser by providing their own at a higher priority, setting the key before the built-in parser runs.

### ResolveInterceptor (RESOLVE = 7000)

Merges raw pieces (PathParams, Query, Body, Files) into a single object matching the request schema shape. Sets `Params`.

```ts
@Component()
@Priority(Interceptor.RESOLVE)
class ResolveInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') {
            ctx.set(PARAMS, undefined);
            return next(ctx);
        }

        const pathParams = ctx.get(PATH_PARAMS) ?? {};
        const query = ctx.get(QUERY) ?? {};
        const body = ctx.get(BODY);
        const files = ctx.get(FILES) ?? {};

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

        ctx.set(PARAMS, merged);
        return next(ctx);
    }
}
```

### ValidateInterceptor (VALIDATE = 8000)

Validates `Params` against the endpoint's request schema. Throws `HttpException(400)` on failure.

```ts
@Component()
@Priority(Interceptor.VALIDATE)
class ValidateInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const endpoint = ctx.get(ENDPOINT);
        if (!endpoint || endpoint.request === 'void') {
            return next(ctx);
        }

        const params = ctx.get(PARAMS);
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
        ctx.set(PARAMS, parsed);

        return next(ctx);
    }
}
```

### ActionInterceptor (ACTION = 10000)

Dispatches to the matched controller action. If no HTTP endpoint matched, passes through to `next()` (does **not** throw 404 — that's handled by the end of the chain).

```ts
@Component()
@Priority(Interceptor.ACTION)
class ActionInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const endpoint = ctx.get(ENDPOINT);
        const ctrl = ctx.get(CONTROLLER);

        // No HTTP endpoint matched — pass through (may be WS or static)
        if (!endpoint || !ctrl) return next(ctx);

        // Find the method name on the controller that matches this endpoint
        const methodName = /* resolved from endpoint name */;
        const handler = (ctrl as any)[methodName];

        if (typeof handler !== 'function') {
            throw new HttpException(500, `Handler method ${String(methodName)} not found`);
        }

        // Call handler with parsed params (or no args if void)
        const params = ctx.get(PARAMS);
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

### WebSocketUpgradeInterceptor (ACTION = 10000)

Handles WebSocket upgrade requests. If the matched endpoint is a WebSocket protocol, performs the upgrade. Otherwise passes through.

```ts
@Component()
@Priority(Interceptor.ACTION)
class WebSocketUpgradeInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const endpoint = ctx.get(ENDPOINT);

        // Not a WebSocket endpoint — pass through
        if (!endpoint?.websocket) return next(ctx);

        const req = ctx.getOrThrow(REQUEST);
        const res = ctx.getOrThrow(RESPONSE);

        // Upgrade the connection using the matched handler and codec
        // Sets up per-connection Context, calls onOpen, wires message dispatch
        await this.upgrade(req, res, endpoint);
    }

    private async upgrade(req: IncomingMessage, res: ServerResponse, endpoint: any) {
        // Implementation delegates to the WebSocket handler framework:
        // 1. Upgrade HTTP → WebSocket
        // 2. Register connection in ConnectionHub
        // 3. RequestContext.run() for the connection scope
        // 4. Call handler.onOpen(conn)
        // 5. Wire inbound message → decode → validate → dispatch to handler method
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
ActionInterceptor (10000)        ← dispatches to controller action (HTTP)
WebSocketUpgradeInterceptor (10000) ← upgrades WebSocket connections
  │
  ▼
StaticFileInterceptor (11000)    ← serves static files (fallback)
  │
  ▼
(end of chain → 404 Not Found)
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

    async getUser(input: GetUserParams, ctx: Context) {
        const user = await this.repo.findById(input.id);
        if (!user) throw new HttpException(404, 'User not found');
        return user;
    }

    async createUser(input: CreateUserBody, ctx: Context) {
        return this.repo.create(input);
    }

    async deleteUser(input: GetUserParams, ctx: Context) {
        await this.repo.delete(input.id);
    }
}

// ---- Interceptor ----

@Component()
@Priority(Interceptor.GUARD)
class AuthInterceptor extends Interceptor {
    async intercept(ctx: Context, next: (ctx: Context) => unknown) {
        const token = ctx.getOrThrow(REQUEST).headers['authorization'];
        if (!token) throw new HttpException(401);
        ctx.set(CURRENT_USER, verifyToken(token));
        return next(ctx);
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

# HTTP Layer Design

## 1. Principles

- **Framework-independent.** Core design has no dependency on Express, Fastify, etc. The HTTP layer produces a standard `(req, res) => void` handler usable with `node:http`, Bun, Deno, or any adapter.
- **Parsed input only.** Handlers receive validated, typed data — not raw streams. Body parsing happens before handlers and interceptors see the request (gRPC-style).
- **Single interception mechanism.** Interceptors replace middleware, guards, pipes, and filters. One abstraction, one chain.
- **Controllers are singletons.** Per-request data lives in `RequestContext` (AsyncLocalStorage), not in the controller instance.
- **Route-first.** All endpoints are defined via `defineRoute()` in `@kavri/schema`. Controllers are implementations of routes — no ad-hoc `@Controller(path)` or `@Get()` decorators.

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
    readonly params: Readonly<Record<string, string>>;
    readonly query: Readonly<Record<string, string>>;
    readonly body: unknown;

    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;

    static get(): RequestContext;
}
```

Static API backed by `AsyncLocalStorage`. Access anywhere via `RequestContext.get()`.

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
        const userId = RequestContext.get().get<string>('userId');
        return this.repo.create({ ...input, createdBy: userId });
    }

    override async deleteUser(input: GetUserParams): Promise<void> {
        await this.repo.delete(input.id);
    }
}
```

- `createController(route)` returns an abstract class with abstract methods matching the route definition. Types are inferred from the route's request/response schemas.
- `@Controller()` composes `@Component()` and registers all routing metadata from the route definition. No manual `@Controller(path)` or `@Get()/@Post()` needed.
- Handlers receive parsed input. Return typed response or a special response object (`Redirect`, `FileResponse`, etc.).
- Access per-request data via `RequestContext.get()`.

## 5. Interceptors

```ts
interface InterceptorContext {
    readonly controller: AnyConstructor<any>;
    readonly method: string | symbol;
    readonly route: RouteDefinition<any>;
    readonly endpointName: string;
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
- Modify request state: `RequestContext.get().set('user', authUser)`
- Transform response: `const res = await next(); return transform(res);`

```ts
@Component()
class LoggingInterceptor extends Interceptor {
    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        const start = Date.now();
        try {
            return await next();
        } finally {
            console.log(`${ctx.endpointName} ${RequestContext.get().url} ${Date.now() - start}ms`);
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
@Conditional((config = injectConfig(BasicAuthConfig, true)) => config !== undefined)
class BasicAuthInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(BasicAuthConfig)) { super(); }

    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        const auth = RequestContext.get().headers.get('authorization');
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
@Conditional((config = injectConfig(StaticConfig, true)) => config !== undefined)
class StaticFileInterceptor extends Interceptor {
    constructor(private readonly config = injectConfig(StaticConfig)) { super(); }

    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
        if (RequestContext.get().url.startsWith(this.config.prefix)) {
            const filePath = resolve(this.config.root, RequestContext.get().url.slice(this.config.prefix.length));
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

    start(): Promise<void>;
    toHandler(): (req: IncomingMessage, res: ServerResponse) => void;
    stop(): Promise<void>;
}
```

### Per-request lifecycle

1. Receive HTTP request
2. Route matching → find controller instance (singleton) + method from route metadata
3. Parse request: extract params, query, body. Validate with request schema.
4. Create `RequestContext`, store in `AsyncLocalStorage`
5. Run interceptor chain → call handler with `(parsedInput)`
6. Handler returns typed value or special response
7. If response schema exists, validate response. Serialize as JSON with 200.
8. If special response (`Redirect`, `FileResponse`, etc.), handle accordingly.

### Bootstrap example

```ts
@Component()
@Touch(UserController, OrderController)
@Touch(LoggingInterceptor, TransactionInterceptor, BasicAuthInterceptor)
@Use(InfraModule)
class MyApplication {}

const app = new WebApplication(MyApplication);
await app.start();
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
class AuthInterceptor extends Interceptor {
    async intercept(ctx: InterceptorContext, next: () => Promise<unknown>) {
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

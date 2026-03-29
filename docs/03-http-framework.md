# 03. HTTP Framework Layer

## Positioning

`@kavri/http` is an **upper layer** built on `@kavri/core`.

- It is optional.
- It does not require Express/Fastify/Koa.
- It integrates request lifecycle with IoC scope.

## Why an in-house HTTP layer?

1. Tight IoC integration (request scope and injection behavior).
2. Predictable middleware/controller lifecycle.
3. Avoid hard coupling to third-party framework semantics.

## Proposed API

```ts
import {
  HttpModule,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Middleware,
} from '@kavri/http';

@Controller('/users')
class UserController {
  constructor(private readonly service = inject(UserService)) {}

  @Get('/:id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post('/')
  create(@Body() body: CreateUserDto) {
    return this.service.create(body);
  }
}

const app = new Container()
  .use(HttpModule.forRoot({ port: 3000 }))
  .provide({ provide: UserService, useClass: UserService });

await app.resolve(HttpApplication).then((http) => http.listen());
```

## Request scope

For each incoming request:

1. create child scope (`request:<id>`)
2. resolve controller in that scope
3. execute handler
4. dispose scope safely

This enables request-local dependencies like request context, auth principal, and transaction units.

## Middleware model

```ts
@Middleware({ order: 10 })
class RequestIdMiddleware {
  async use(ctx: HttpContext, next: () => Promise<void>) {
    ctx.set('requestId', crypto.randomUUID());
    await next();
  }
}
```

Supported concerns:

- auth
- logging
- tracing
- rate limiting
- body parsing
- CORS

## Error handling

- structured `HttpError`
- mapping from domain errors to status codes
- fallback 500 handler with correlation id

## Transport details

Initial transport can target Node's built-in `http`/`http2` modules.
Adapters for edge runtimes can be added via compatible request/response abstractions.

## Bootstrapping style

### Minimal

```ts
await serve({
  port: 3000,
  controllers: [UserController],
  providers: [UserService],
});
```

### Full control

```ts
const container = new Container().use(HttpModule.forRoot({ port: 3000 }));
container.provide(...providers);
const http = await container.resolve(HttpApplication);
await http.listen();
```

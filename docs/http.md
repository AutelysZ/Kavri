# HTTP Layer Design

## 1. Positioning

HTTP is an optional upper layer on top of IoC core.

- no dependency on Express/Fastify/Koa
- request lifecycle mapped to IoC scoped container
- IoC remains standalone when HTTP is not used

## 2. HTTP primitives

- `HttpModule`
- `HttpApplication`
- `@Controller`, route decorators
- middleware pipeline
- exception mapping

## 3. Request scope model

Per request:

1. create child scope
2. bind request/response/context tokens
3. resolve controller handler in scope
4. execute middleware + handler
5. destroy request scope

## 4. Error handling

- typed `HttpError`
- fallback 500 with request id
- domain-to-http mapping strategy

## 5. Full example (IoC + HTTP)

```ts
import { Container, Component, inject } from '@kavri/core';
import { ConfigModule, defineZodConfig, injectConfig } from '@kavri/config';
import { HttpModule, HttpApplication, Controller, Get, Param } from '@kavri/http';
import { z } from 'zod';

const ServerConfig = defineZodConfig('server', z.object({
  port: z.number().int().min(1).max(65535).default(3000),
}));

@Component()
class UserService {
  async getUser(id: string) {
    return { id, name: `user-${id}` };
  }
}

@Controller('/users')
class UserController {
  constructor(private readonly users = inject(UserService)) {}

  @Get('/:id')
  async getById(@Param('id') id: string) {
    return this.users.getUser(id);
  }
}

@Component()
class Bootstrap {
  constructor(
    private readonly http = inject(HttpApplication),
    private readonly serverCfg = injectConfig(ServerConfig),
  ) {}

  async start() {
    await this.http.listen({ port: this.serverCfg.port });
  }
}

const app = new Container()
  .use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }))
  .use(HttpModule.forRoot({ controllers: [UserController] }))
  .provide(UserService);

await app.validate();
await app.resolve(Bootstrap).then((b) => b.start());
```

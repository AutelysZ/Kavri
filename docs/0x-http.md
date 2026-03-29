# 0x HTTP Layer Design

## 1. Positioning

HTTP is an optional upper layer built on IoC core. IoC remains fully usable without HTTP.

## 2. Types used in this document

```ts
type Constructor<T> = abstract new (...args: any[]) => T;
interface ModuleRef { kind: 'module'; name: string; }

interface HttpApplication {
  listen(options: { port: number }): Promise<void>;
}

declare class HttpModule {
  static forRoot(options: {
    controllers: Constructor<any>[];
  }): ModuleRef;
}

declare function Controller(path: string): ClassDecorator;
declare function Get(path: string): MethodDecorator;
declare function Param(name: string): ParameterDecorator;
```

## 3. Runtime model

Per request:

1. create IoC child scope
2. bind request-related tokens
3. resolve controller/handler in that scope
4. execute middleware and handler
5. destroy request scope

## 4. Full example

```ts
import { Container, Component, inject, injectConfig, Constructor } from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
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

const app = new Container();
app.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
app.use(HttpModule.forRoot({ controllers: [UserController] }));
app.provide(UserService);

const bootstrap = await app.resolve(Bootstrap);
await bootstrap.start();
```

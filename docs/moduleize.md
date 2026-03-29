# Moduleization Design

## 1. Why moduleize

IoC can run without modules, but modules are needed for large codebases to manage visibility, ownership, and composition.

## 2. Design requirements

- simple for small apps (no module mandatory)
- explicit imports/exports for large apps
- support feature modules and composition roots
- preserve IoC-first behavior

## 3. Proposed module API

```ts
const UserModule = defineModule({
  name: 'user',
  providers: [UserService, UserRepo],
  exports: [UserService],
});

const AppModule = defineModule({
  name: 'app',
  imports: [UserModule],
  providers: [AppService],
});
```

## 4. Visibility rules

- providers are private by default
- only `exports` are visible to importers
- import graph is explicit and acyclic (recommended)

## 5. Dynamic module patterns

- `forRoot(...)`: global setup
- `forFeature(...)`: local feature registration
- lazy module import (optional)

## 6. IoC interaction rules

- module system is registration organization, not a different container runtime
- module providers follow same lifecycle/scope/provider rules
- selector/registry patterns work identically inside modules

## 7. Full example (moduleized composition)

```ts
import { Container, Component, defineModule, inject, token, injectConfig } from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
import { z } from 'zod';

const DbConfig = defineZodConfig('db', z.object({ url: z.string() }));
const DbToken = token<{ query(sql: string): Promise<unknown> }>('db');

const DatabaseModule = defineModule({
  name: 'database',
  providers: [
    {
      provide: DbToken,
      useFactory: (cfg = injectConfig(DbConfig)) => ({
        async query(sql: string) {
          return `query(${sql})@${cfg.url}`;
        },
      }),
    },
  ],
  exports: [DbToken],
});

@Component()
class UserService {
  constructor(private readonly db = inject(DbToken)) {}
  async getUser(id: string) {
    await this.db.query(`select * from users where id='${id}'`);
    return { id, name: 'mock' };
  }
}

const UserModule = defineModule({
  name: 'user',
  imports: [DatabaseModule],
  providers: [UserService],
  exports: [UserService],
});

@Component()
class AppService {
  constructor(private readonly users = inject(UserService)) {}
  async run() {
    return this.users.getUser('u1');
  }
}

const AppModule = defineModule({
  name: 'app',
  imports: [UserModule],
  providers: [AppService],
});

const container = new Container()
  .use(ConfigModule.from({ files: ['application.yaml'] }))
  .use(AppModule);

await container.validate();
const app = await container.resolve(AppService);
console.log(await app.run());
await container.destroy();
```

# 0x Moduleization Design

## 1. Purpose

Moduleization organizes provider registration for medium/large projects while keeping one IoC runtime model.

## 2. Types used in this document

```ts
type Constructor<T> = abstract new (...args: any[]) => T;
type TokenLike<T> = Token<T> | Constructor<T>;

interface Token<T> { kind: 'token'; name: string; }
interface ModuleRef { kind: 'module'; name: string; }

type ProviderInput = unknown;

interface ModuleSpec {
  name: string;
  imports?: ModuleRef[];
  providers?: ProviderInput[];
  exports?: TokenLike<any>[];
}

declare function defineModule(spec: ModuleSpec): ModuleRef;
```

## 3. Rules

- providers are private unless exported
- imports form explicit visibility edges
- module layer does not change provider/lifecycle semantics
- modules are optional for small apps

## 4. Full example

```ts
import {
  Container,
  Component,
  defineModule,
  token,
  inject,
  injectConfig,
  ProviderInput,
  ModuleRef,
} from '@kavri/core';
import { ConfigModule, defineZodConfig } from '@kavri/config';
import { z } from 'zod';

const DbConfig = defineZodConfig('db', z.object({ url: z.string() }));
const DbToken = token<{ query(sql: string): Promise<string> }>('db');

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

const container = new Container();
container.use(ConfigModule.from({ files: ['application.yaml'] }));
container.use(AppModule);

const app = await container.resolve(AppService);
console.log(await app.run());
await container.destroy();
```

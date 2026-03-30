# Modularization Design

## 1. Purpose

Module is a lightweight wrapper over a component set plus optional init/destroy logic.
There is no root/local module hierarchy model; ESM already handles physical modularization.

`defineModule(...)` is used to:

1. register a cohesive set of components/providers
2. run custom init/destroy logic (for example loading configuration files)

## 2. Types used in this document

```ts
type Constructor<T> = abstract new () => T;
type TokenLike<T> = Token<T> | Constructor<T>;

interface Token<T> { kind: 'token'; id: symbol; }
interface ModuleRef { kind: 'module'; name: string; }

type ProviderInput = unknown;
interface ModuleSetupContext {
  provide(...providers: ProviderInput[]): void;
  use(module: ModuleRef): void;
}

interface ModuleSpec {
  name: string;
  providers?: ProviderInput[];
  setup?: (container: ModuleSetupContext) => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

declare function defineModule(spec: ModuleSpec): ModuleRef;
```

## 3. Rules

- Module is optional for small applications.
- Module does not change provider resolution or lifecycle semantics.
- Module can register providers and run init/destroy hooks.
- Use module factory functions (`createXxxModule(params)`) for dynamic module behavior.

## 4. Full example

```ts
import {
  Container,
  Component,
  defineModule,
  token,
  inject,
  ProviderInput,
} from '@kavri/core';
import { createConfigModule, defineZodConfig, injectConfig } from '@kavri/config';
import { z } from 'zod';

const DbConfig = defineZodConfig('db', z.object({ url: z.string() }));
const DbToken = token<{ query(sql: string): Promise<string> }>();

function createDatabaseModule() {
  return defineModule({
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
  });
}

@Component()
class UserService {
  constructor(private readonly db = inject(DbToken)) {}

  async getUser(id: string) {
    await this.db.query(`select * from users where id='${id}'`);
    return { id, name: 'mock' };
  }
}

function createUserModule() {
  return defineModule({
    name: 'user',
    providers: [UserService],
  });
}

@Component()
class AppService {
  constructor(private readonly users = inject(UserService)) {}

  async run() {
    return this.users.getUser('u1');
  }
}

const AppModule = defineModule({
  name: 'app',
  setup(container) {
    container.use(createDatabaseModule());
    container.use(createUserModule());
    container.provide(AppService);
  },
});

const container = new Container();
container.use(createConfigModule({ files: ['application.yaml'] }));
container.use(AppModule);

const app = await container.resolve(AppService);
console.log(await app.run());
await container.destroy();
```

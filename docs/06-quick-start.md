# 06. Quick Start & Entry Patterns

## 6.1 Smallest IoC usage

```ts
import { Container, Component, inject } from '@kavri/core';

@Component()
class Foo {
  hello() {
    return 'hello';
  }
}

@Component()
class App {
  constructor(private readonly foo = inject(Foo)) {}
  run() {
    console.log(this.foo.hello());
  }
}

const container = new Container();
const app = await container.resolve(App); // lifecycle enabled
app.run();
await container.destroy();
```

## 6.2 `get` vs `resolve`

```ts
const container = new Container();

const a = container.get(Foo); // instantiate only
const b = await container.resolve(Foo); // full lifecycle flow
```

## 6.3 Token provider for external library

```ts
const SequelizeToken = token<Sequelize>('sequelize',
  (cfg = injectConfig(SequelizeConfig)) => new Sequelize(cfg.url),
);

const sequelize = await container.resolve(SequelizeToken);
```

## 6.4 Dynamic provider registration (database)

```ts
import { registerPsql } from '@kavri/database/psql';

const app = new Container();
registerPsql(app);

app.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
app.use(DatabaseModule);

await app.validate();
```

If `application.yaml` selects `mssql` while only `registerPsql(app)` was called, startup fails with clear guidance.

## 6.5 Simple HTTP app (optional upper layer)

```ts
import { serve, Controller, Get } from '@kavri/http';

@Controller('/health')
class HealthController {
  @Get('/')
  ok() {
    return { status: 'ok' };
  }
}

await serve({ port: 3000, controllers: [HealthController] });
```

## 6.6 Presets

- `createContainer()` — lightweight IoC bootstrap
- `createApp()` — full app preset (config + validation + diagnostics)
- `serve()` — HTTP-focused shortcut

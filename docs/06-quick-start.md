# 06. Quick Start & Entry Patterns

## 6.1 Core IoC only (small script/service)

```ts
import { Container, Component, inject } from '@kavri/core';

@Component()
class Clock {
  now() {
    return new Date().toISOString();
  }
}

@Component()
class App {
  constructor(private readonly clock = inject(Clock)) {}
  run() {
    console.log(this.clock.now());
  }
}

const container = new Container();
const app = await container.resolve(App); // with lifecycle
app.run();
await container.destroy();
```

## 6.2 Difference between `get` and `resolve`

```ts
const container = new Container();

const a = container.get(Foo);        // sync instantiate, no lifecycle
const b = await container.resolve(Foo); // async-safe + lifecycle hooks
```

Use `get` for local/simple cases when you intentionally do not need startup hooks.
Use `resolve` for application composition and production startup.

## 6.3 Simple HTTP app

```ts
import { serve, Controller, Get } from '@kavri/http';

@Controller('/health')
class HealthController {
  @Get('/')
  ok() {
    return { status: 'ok' };
  }
}

await serve({
  port: 3000,
  controllers: [HealthController],
});
```

## 6.4 App with config + dynamic database provider

```ts
import { Container } from '@kavri/core';
import { ConfigModule } from '@kavri/config';
import { DatabaseModule } from '@kavri/database';
import { providePsql } from '@kavri/database/psql';

const app = new Container();
providePsql(app); // register only what user wants

app.use(ConfigModule.from({ files: ['application.yaml'], cli: process.argv }));
app.use(DatabaseModule);

await app.validate();
await app.resolve(Bootstrap);
```

## 6.5 Suggested entrypoint presets

- `createApp()` -> full app preset (config + lifecycle validation + diagnostics)
- `createContainer()` -> lightweight IoC preset
- `serve()` -> HTTP-focused shortcut

This gives beginners a one-liner while preserving power-user control.

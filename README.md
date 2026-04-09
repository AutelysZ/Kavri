# Kavri

A TypeScript IoC framework where **default parameters are the dependency graph**.

No `reflect-metadata`. No parameter decorators. No `emitDecoratorMetadata`. Just constructors doing what constructors already do — declaring what they need.

- **`inject()` in default params** — the container evaluates them. That's the entire DI mechanism.
- **Async is invisible** — async providers resolve via suspense-style throw-and-retry. `inject()` is always synchronous. No `Promise<T>` wrappers, no two-phase init.
- **Every decorator is metadata** — `Metadata.of(Cacheable, cls)` reads any decorator's typed data. Build your own with `createClassDecorator`. No reflection, no side channels.
- **Config is just injection** — `@Configuration('db')` + `injectConfig(DbOptions)`. Class-based schemas replace Zod. No separate parser step.
- **Web, events, logging** — optional upper layers built on the same IoC core. Use what you need.

```ts
import { Component, Container, inject } from '@kavri/container';

@Component()
class GreetService {
  greet(name: string) {
    return `Hello, ${name}!`;
  }
}

@Component()
class Application {
  constructor(private readonly greet = inject(GreetService)) {}
  run() {
    console.log(this.greet.greet('world'));
  }
}

const container = new Container();
const app = await container.resolve(Application);
app.run();
await container.destroy();
```

## Documentation

See [`docs/`](./docs/00-overview.md) for full design documentation.

## License

[MIT](./LICENSE)

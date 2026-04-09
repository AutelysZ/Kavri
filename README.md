# Kavri

TypeScript IoC framework. No reflect-metadata — uses default parameters as injection points.

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

# 05. Dynamic Provider Registry

## Problem

Some integrations are pluggable (e.g., database drivers: psql/mysql/mssql).

Kavri should allow users to register only the drivers they explicitly import. If configuration asks for a driver that was not registered, startup must fail with a clear error.

## Proposed abstraction: `registryToken<T>()`

```ts
const DatabaseDriverRegistry = registryToken<Driver>('database.provider');
```

This token represents a map-like provider registry keyed by string IDs.

## Driver package pattern

### `database/psql.ts`

```ts
class PsqlDriver implements Driver {
  /* ... */
}

export const providePsql = DatabaseDriverRegistry.register('psql', PsqlDriver);
```

### `database/mysql.ts`

```ts
class MysqlDriver implements Driver {
  /* ... */
}

export const provideMysql = DatabaseDriverRegistry.register('mysql', MysqlDriver);
```

## Application usage

```ts
import { providePsql } from 'database/psql';

const container = new Container();
providePsql(container);

container.use(ConfigModule.from({ files: ['app.yaml'] }));
container.use(DatabaseModule);

await container.validate();
```

`app.yaml`:

```yaml
database:
  driver: psql
```

## Resolution strategy in `DatabaseModule`

```ts
const DatabaseConfig = defineZodConfig('database', z.object({
  driver: z.enum(['psql', 'mysql', 'mssql']),
}));

container.provide({
  provide: DbClient,
  useFactory: (cfg = inject(DatabaseConfig), reg = inject(DatabaseDriverRegistry)) => {
    const impl = reg.get(cfg.driver);
    if (!impl) {
      throw new DynamicProviderNotFoundError({
        registry: 'database.provider',
        key: cfg.driver,
        message: `Database driver "${cfg.driver}" is configured but not registered. Import and call provide${cfg.driver[0].toUpperCase() + cfg.driver.slice(1)}(...).`,
      });
    }
    return new impl();
  },
});
```

## Safety and ergonomics

- **explicit import + explicit registration** (no side-effect `import 'database/psql'` required)
- validation can assert required registry entry exists before serving traffic
- useful for optional peer dependencies and smaller bundles

## Error contract

Suggested error payload:

```ts
{
  code: 'DYNAMIC_PROVIDER_NOT_FOUND',
  registry: 'database.provider',
  key: 'mssql',
  suggestions: ['providePsql', 'provideMysql']
}
```

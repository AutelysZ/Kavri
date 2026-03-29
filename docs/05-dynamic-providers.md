# 05. Dynamic Provider Registry

## Problem statement

Modules like database integration must support multiple implementations (psql/mysql/mssql), but only load implementations explicitly installed/registered by user code.

### Required behavior

- User imports and calls explicit registration functions, e.g. `registerPsql(container)`.
- Configuration selects driver key, e.g. `database.driver = "psql"`.
- If config selects a key not registered, startup fails with a clear error.

## Baseline API

```ts
const DriverRegistry = registry<Driver>('database.driver');

export const registerPsql = DriverRegistry.register('psql', PsqlDriver);
export const registerMysql = DriverRegistry.register('mysql', MysqlDriver);
export const registerMssql = DriverRegistry.register('mssql', MssqlDriver);
```

No implicit side-effect imports required.

## Selected driver token

```ts
const DriverToken = token<Driver>('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);
```

## Optional boilerplate reducers

### `configRegistry(...)`

```ts
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

Equivalent to:

```ts
const DriverToken = token('database.driver.selected',
  (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
);
```

### Registry with built-in provider

```ts
const DriverRegistry = registry<Driver>(
  'database.driver',
  (r, cfg = injectConfig(DatabaseConfig)) => r.getOrThrow(cfg.driver),
);
```

Proposed signature:

```ts
registry<T>(
  name: string,
  provider?: (registry: Registry<T>) => TokenLike<T> | T,
): RegistryToken<T>;
```

## Concrete flow

```ts
import { registerPsql } from '@kavri/database/psql';

const container = new Container();
registerPsql(container);

container.use(ConfigModule.from({ files: ['application.yaml'] }));
container.use(DatabaseModule);

await container.validate();
await container.resolve(AppBootstrap);
```

`application.yaml`:

```yaml
database:
  driver: psql
```

## Error case (intended)

If config sets `database.driver = mssql` but app only called `registerPsql(container)`, throw:

```txt
[DYNAMIC_PROVIDER_NOT_FOUND] registry=database.driver key=mssql
Configured implementation was not registered.
Registered keys: psql
Hint: import and call registerMssql(container)
```

## Additional scenarios supported by same model

- payment gateways: `stripe`, `adyen`, `paypal`
- message queues: `kafka`, `rabbitmq`, `nats`
- storage backends: `s3`, `gcs`, `azure-blob`
- auth providers: `local`, `oidc`, `saml`

## Lifecycle handling

Registry entries can still define lifecycle via selected token provider.

```ts
container.provide({
  provide: DriverToken,
  useFactory: (cfg = injectConfig(DatabaseConfig)) => DriverRegistry.getOrThrow(cfg.driver),
  onInit: (driver) => driver.connect?.(),
  onDestroy: (driver) => driver.close?.(),
});
```

# 04. Configuration Module

## Why config is first-class

Configuration directly controls provider behavior (selected implementations, lifecycles, feature gates). In Kavri, config is a first-class system, not a side utility.

## Goals

- feature-rich experience similar to Spring Boot
- composable as `ConfigModule`
- typed and validated
- supports class-validator and zod styles
- integrates deeply with provider selection and dynamic registries

## Sources and precedence

Priority (high -> low):

1. runtime overrides
2. CLI args (`--app.port=8080`)
3. env vars (`APP_PORT=8080`)
4. config files (`.yaml`, `.json`, `.toml`)
5. defaults

## Module API

```ts
ConfigModule.from({
  files: ['application.yaml', 'application.local.yaml'],
  envPrefix: 'APP',
  cli: process.argv,
  profile: process.env.APP_PROFILE ?? 'default',
  strictUnknownKeys: true,
});
```

## Validation style A — class-validator

```ts
import { IsNumber, IsString } from 'class-validator';

@ConfigSchema('app.server')
class ServerConfig {
  @IsNumber()
  port = 3000;

  @IsString()
  host = '0.0.0.0';
}

const serverConfig = injectConfig(ServerConfig);
```

## Validation style B — zod

```ts
const ServerConfig = defineZodConfig('app.server', z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
}));

const serverConfig = injectConfig(ServerConfig);
```

## Config -> provider helpers

### `injectConfig`

```ts
const db = injectConfig(DatabaseConfig);
```

### `configToken`

Generate token value directly from config field:

```ts
const SelectedPetToken = configToken('pets.selected', PetConfig, 'selectedPet');
```

### `configRegistry`

Resolve an implementation from a named registry based on config field:

```ts
const DriverToken = configRegistry('database.driver', DatabaseConfig, 'driver');
```

This avoids repetitive boilerplate in dynamic provider scenarios.

## Advanced features

- profile docs (`application-prod.yaml`)
- placeholder expansion (`${DB_HOST:localhost}`)
- secret source adapters (vault/kms)
- optional reload/watch mode
- startup report of effective resolved values (with secret masking)

## Failure semantics

Startup fails when:

- missing required key
- parse failure
- validation failure
- unknown strict key
- referenced dynamic provider key is unregistered

Errors should include:

- key path
- expected type/rule
- source origin (cli/env/file/default)
- suggested fix

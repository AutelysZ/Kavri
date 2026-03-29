# 04. Configuration Module

## Goals

The config module should feel **feature-rich like Spring Boot**, while staying explicit and TypeScript-friendly.

## Design requirements

- modular and importable (`ConfigModule`)
- multi-source loading (CLI args, env vars, config files)
- schema validation with both:
  - class-validator style
  - zod style
- profile/environment support
- typed retrieval in runtime

## Source loading

Priority (high -> low):

1. explicit runtime overrides
2. CLI arguments (`--app.port=8080`)
3. environment variables (`APP_PORT=8080`)
4. configuration files (`.yaml`, `.json`, `.toml`)
5. schema defaults

## Module API

```ts
ConfigModule.from({
  files: ['application.yaml', 'application.local.yaml'],
  envPrefix: 'APP',
  cli: process.argv,
  profile: process.env.APP_PROFILE ?? 'default',
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

const serverConfig = inject(configToken(ServerConfig));
```

## Validation style B — zod

```ts
const ServerSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
});

const ServerConfig = defineZodConfig('app.server', ServerSchema);
const serverConfig = inject(ServerConfig);
```

## Typed value retrieval

```ts
const port = config.value(ServerConfig, 'port');
const host = config.value(ServerConfig, 'host');
```

## Advanced features

- placeholder resolution (`${DB_HOST:localhost}`)
- profile documents (`application-prod.yaml`)
- encrypted secret source abstraction (vault/kms adapters)
- config change events for reloadable providers

## Failure behavior

Startup must fail if:

- required value missing
- value parsing fails
- schema validation fails
- unknown strict-mode keys are present

Errors should include key path, source, and parse stage.

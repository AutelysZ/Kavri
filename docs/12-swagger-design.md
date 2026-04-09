# Swagger Module Design

Package: `@kavri/swagger` — depends on `@kavri/web` and `@kavri/schema`.

## 1. Purpose

Serve OpenAPI JSON and Swagger UI from a running `@kavri/web` application. No build step — generated at startup from registered route definitions.

## 2. Configuration

```ts
@Configuration('kavri.swagger')
class SwaggerOptions {
    /** Enable swagger endpoints. Default: true. */
    @IsBoolean({ default: true }) enabled!: boolean;
    /** Path prefix for swagger endpoints. */
    @IsString({ default: '/swagger' }) path!: string;
    /** OpenAPI info.title. */
    @IsString({ default: 'API' }) title!: string;
    /** OpenAPI info.version. */
    @IsString({ default: '1.0.0' }) version!: string;
    /** OpenAPI info.description. */
    @IsString({ optional: true }) description?: string;
}
```

## 3. SwaggerInterceptor

Serves two endpoints under the configured path prefix:

- `GET {path}/json` — OpenAPI 3.x JSON document
- `GET {path}` and `GET {path}/*` — Swagger UI (static HTML/JS/CSS)

```ts
@Component()
@Priority(Interceptor.ROUTE - 2)
@ConditionalOnConfiguration(SwaggerOptions, 'enabled')
class SwaggerInterceptor extends Interceptor {
    private openApiDoc!: object;
    private uiHtml!: string;

    constructor(private readonly config = injectConfig(SwaggerOptions)) { super(); }

    @OnConstruct()
    init(controllers = injectAll(Controller)) {
        // Collect all route definitions from registered controllers
        const routes: RouteDefinition<any>[] = [];
        for (const ctrl of controllers) {
            const meta = Metadata.of(Controller, ctrl);
            if (meta.length > 0) routes.push(meta[0].route);
        }

        // Also collect WebSocket protocols for documentation
        const wsHandlers = injectAll(WebSocketHandler);
        // ... add WebSocket endpoints as async API docs if desired

        // Merge all routes into a single OpenAPI document
        this.openApiDoc = mergeOpenAPI(routes, {
            title: this.config.title,
            version: this.config.version,
            description: this.config.description,
        });

        // Pre-render Swagger UI HTML with the JSON URL injected
        this.uiHtml = renderSwaggerUI(`${this.config.path}/json`);
    }

    async intercept(next: () => unknown) {
        const url = RequestContext.getOrThrow(kURL);
        const pathname = url.pathname;

        if (pathname === `${this.config.path}/json`) {
            return new RawResponse(200, { 'Content-Type': 'application/json' },
                JSON.stringify(this.openApiDoc));
        }

        if (pathname === this.config.path || pathname.startsWith(`${this.config.path}/`)) {
            // Serve Swagger UI assets
            const asset = pathname.slice(this.config.path.length + 1);
            if (!asset || asset === 'index.html') {
                return new RawResponse(200, { 'Content-Type': 'text/html' }, this.uiHtml);
            }
            // Serve bundled swagger-ui-dist assets (CSS, JS)
            return serveSwaggerAsset(asset);
        }

        return next();
    }
}
```

## 4. OpenAPI generation

Uses `generateOpenAPI()` from `@kavri/schema` for each route, then merges:

```ts
declare function mergeOpenAPI(
    routes: RouteDefinition<any>[],
    info: { title: string; version: string; description?: string },
): object;
```

`mergeOpenAPI` combines all routes into a single OpenAPI 3.x document. Paths are deduped. Tags come from `EndpointOptions.tags`. Schemas are collected into `components.schemas` with `$ref` pointers.

## 5. Swagger UI rendering

```ts
/**
 * Render the Swagger UI HTML page. Injects the OpenAPI JSON URL.
 * Uses swagger-ui-dist (peer dependency).
 */
declare function renderSwaggerUI(jsonUrl: string): string;
```

The rendered HTML loads swagger-ui from bundled assets and points at the JSON endpoint. No CDN dependency.

`swagger-ui-dist` is a **peer dependency** of `@kavri/swagger` — users install it themselves.

## 6. Usage

```ts
import { Component, Touch } from '@kavri/container';
import { SwaggerInterceptor } from '@kavri/swagger';

@Component()
@Touch(UserController, OrderController)
@Touch(SwaggerInterceptor)
class MyApp {}

const app = await WebApplication.create(MyApp);
await app.start();

// GET /swagger      → Swagger UI
// GET /swagger/json → OpenAPI JSON
```

Config:

```yaml
kavri:
  swagger:
    enabled: true
    path: /docs
    title: My API
    version: 2.0.0
    description: My API documentation
```

## 7. Production

Disable in production via config:

```yaml
# config/config.production.yaml
kavri:
  swagger:
    enabled: false
```

Or via environment variable: `KAVRI_SWAGGER_ENABLED=false`.

The `@ConditionalOnConfiguration(SwaggerOptions, 'enabled')` ensures the interceptor is never instantiated when disabled — zero overhead.

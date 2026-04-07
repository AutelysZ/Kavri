# Logging Module Design

Package: `@kavri/log` — depends on `@kavri/core` and `@kavri/config`. Does NOT depend on `@kavri/web`.

Built on [Pino](https://github.com/pinojs/pino).

## 1. Principles

- **Structured logging.** JSON by default. Pretty-print for development.
- **Contextual loggers.** `injectLogger(context)` creates child loggers with pre-set fields.
- **Request-aware.** When inside a request context (`@kavri/web`), loggers automatically include request-scoped data (request ID, tracing, etc.) via `kLogging` key.
- **Configurable.** Format, level, destinations, rotation, redaction — all via `@Configuration('kavri.log')`.

## 2. Configuration

```ts
@Configuration('kavri.log')
class LogConfig {
    /** Log format. 'json' for production, 'pretty' for development. */
    @IsString({ default: 'json' })
    format!: string;

    /** Minimum log level. */
    @IsString({ default: 'info' })
    level!: string;  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

    /**
     * Output destinations. Each entry routes logs at a given level to a destination.
     * Default: all levels → stdout.
     *
     * Example:
     *   - { level: 'info', destination: 'stdout' }
     *   - { level: 'error', destination: './logs/error.log' }
     *   - { level: 'trace', destination: './logs/all.log' }
     */
    @IsArray(IsObject({
        level: IsString(),
        destination: IsString(),
    }), { optional: true })
    outputs?: Array<{ level: string; destination: string }>;

    /**
     * Log rotation rules. Applied to file destinations.
     */
    @IsObject({
        maxSize: IsString({ optional: true }),    // e.g., '10m', '100m', '1g'
        maxFiles: IsInteger({ optional: true }),   // max rotated files to keep
        interval: IsString({ optional: true }),    // e.g., '1d', '12h'
    }, { optional: true })
    rotation?: {
        maxSize?: string;
        maxFiles?: number;
        interval?: string;
    };

    /**
     * Paths to redact from log output.
     * Uses Pino's built-in redaction. Supports wildcards.
     * Example: ['password', 'creditCard', '*.secret', 'headers.authorization']
     */
    @IsArray(IsString(), { optional: true })
    redact?: string[];
}
```

## 3. Logger

```ts
abstract class Logger {
    abstract trace(msg: string, ...args: unknown[]): void;
    abstract debug(msg: string, ...args: unknown[]): void;
    abstract info(msg: string, ...args: unknown[]): void;
    abstract warn(msg: string, ...args: unknown[]): void;
    abstract error(msg: string, ...args: unknown[]): void;
    abstract fatal(msg: string, ...args: unknown[]): void;

    /** Log with structured data. */
    abstract trace(data: object, msg?: string): void;
    abstract debug(data: object, msg?: string): void;
    abstract info(data: object, msg?: string): void;
    abstract warn(data: object, msg?: string): void;
    abstract error(data: object, msg?: string): void;
    abstract fatal(data: object, msg?: string): void;

    /** Create a child logger with additional context. */
    abstract child(context: object): Logger;
}
```

Under the hood, wraps Pino. When inside a request context, automatically merges `kLogging` data into every log entry.

## 4. Injection

### inject(Logger) — root logger

```ts
@Component()
class AppService {
    constructor(private readonly logger = inject(Logger)) {}

    doWork() {
        this.logger.info('doing work');
    }
}
```

### injectLogger(context) — contextual logger

```ts
declare function injectLogger(context: string | object | AnyConstructor<any>): Logger;
```

- `injectLogger(WebApplication)` → child logger with `{ name: 'WebApplication' }`
- `injectLogger('payment')` → child logger with `{ name: 'payment' }`
- `injectLogger({ service: 'payment', version: '1.0' })` → child logger with those fields

`injectLogger` is an inject point — usable in constructor defaults, `@OnConstruct`, etc.

```ts
@Component()
class PaymentService {
    constructor(private readonly logger = injectLogger(PaymentService)) {}

    async process(orderId: string) {
        this.logger.info({ orderId }, 'processing payment');
        // logs: { name: 'PaymentService', orderId: '123', msg: 'processing payment', ... }
    }
}
```

## 5. Request-aware logging

When inside a `RequestContext` (`@kavri/web`), loggers automatically include data from `kLogging`. This allows interceptors to enrich the logging context.

### kLogging key (from `@kavri/web`)

```ts
// In @kavri/web
const kLogging = RequestContext.key<Record<string, unknown>>('logging');
```

Any interceptor can append data:

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class RequestIdInterceptor extends Interceptor {
    async intercept(next: () => unknown) {
        const requestId = crypto.randomUUID();
        kLogging.getOrInsertComputed(() => ({}));
        kLogging.getOrThrow()['requestId'] = requestId;

        const req = kRequest.getOrThrow();
        kLogging.getOrThrow()['method'] = req.method;
        kLogging.getOrThrow()['url'] = req.url;

        return next();
    }
}
```

When the logger writes an entry, it checks `kLogging.get()` and merges the data:

```ts
// Logger internally:
log(level, data, msg) {
    const extra = RequestContext.isActive() ? kLogging.get() : undefined;
    if (extra) {
        data = { ...extra, ...data };
    }
    pino[level](data, msg);
}
```

### Built-in web logging interceptor (from `@kavri/web`)

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class WebLoggingInterceptor extends Interceptor {
    constructor(private readonly logger = injectLogger(WebLoggingInterceptor)) {}

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();

        // Initialize logging context
        kLogging.set({
            requestId,
            method: req.method,
            url: req.url,
        });

        const start = Date.now();
        try {
            const result = await next();
            this.logger.info({ status: 200, duration: Date.now() - start }, 'request completed');
            return result;
        } catch (err) {
            const status = err instanceof HttpException ? err.status : 500;
            this.logger.error({ status, duration: Date.now() - start, err }, 'request failed');
            throw err;
        }
    }
}
```

Because `kLogging` is set before `next()`, every downstream logger call automatically includes `requestId`, `method`, `url`.

## 6. ESLint

Add `injectLogger` to `@kavri/eslint-plugin` affected functions list.

## 7. Example

```ts
import { Component, inject } from '@kavri/core';
import { Logger, injectLogger } from '@kavri/log';

@Component()
class OrderService {
    constructor(
        private readonly logger = injectLogger(OrderService),
        private readonly paymentService = inject(PaymentService),
    ) {}

    async createOrder(userId: string) {
        this.logger.info({ userId }, 'creating order');
        // If inside a request: logs include { requestId, method, url, name: 'OrderService', userId }
        // If outside (CLI, worker): logs include { name: 'OrderService', userId }
    }
}
```

```yaml
# config/config.yaml
kavri:
  log:
    format: json
    level: info
    outputs:
      - level: info
        destination: stdout
      - level: error
        destination: ./logs/error.log
    rotation:
      maxSize: 100m
      maxFiles: 5
    redact:
      - password
      - "*.secret"
      - headers.authorization
```

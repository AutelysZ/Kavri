# Logging Module Design

Package: `@kavri/log` — depends on `@kavri/core` and `@kavri/config`. Does NOT depend on `@kavri/web`.

Self-contained implementation. No external logging framework dependency.

## 1. Principles

- **Structured logging.** JSON by default. Pretty-print for development.
- **Contextual loggers.** `injectLogger(context)` creates child loggers with pre-set fields.
- **Configurable.** Format, level, output destinations, redaction — all via `@Configuration('kavri.log')`.

## 2. Configuration

```ts
enum LogFormat {
    JSON = 'json',
    Pretty = 'pretty',
}

enum LogLevel {
    Trace = 'trace',
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Fatal = 'fatal',
    Silent = 'silent',
}

@Configuration('kavri.log')
class LogConfiguration {
    /** Log format. */
    @IsEnum(LogFormat, { default: LogFormat.JSON })
    format!: LogFormat;

    /** Minimum log level. */
    @IsEnum(LogLevel, { default: LogLevel.Info })
    level!: LogLevel;

    /** Default output destination for all levels. 'stdout', 'stderr', or file path. */
    @IsString({ default: 'stdout' })
    output!: string;

    /**
     * Per-level output overrides. Key = level name, value = destination.
     * Example: { error: './logs/error.log', fatal: './logs/fatal.log' }
     * Levels not listed here use `output` as the destination.
     */
    @IsRecord(IsString(), { optional: true })
    outputs?: Record<string, string>;

    /** Paths to redact from log output. Supports wildcards. */
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

    abstract trace(data: object, msg?: string): void;
    abstract debug(data: object, msg?: string): void;
    abstract info(data: object, msg?: string): void;
    abstract warn(data: object, msg?: string): void;
    abstract error(data: object, msg?: string): void;
    abstract fatal(data: object, msg?: string): void;

    abstract child(context: object): Logger;
}
```

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

- `injectLogger(PaymentService)` → child logger with `{ name: 'PaymentService' }`
- `injectLogger('payment')` → child logger with `{ name: 'payment' }`
- `injectLogger({ service: 'payment', version: '1.0' })` → child logger with those fields

`injectLogger` is an inject point.

```ts
@Component()
class PaymentService {
    constructor(private readonly logger = injectLogger(PaymentService)) {}

    async process(orderId: string) {
        this.logger.info({ orderId }, 'processing payment');
    }
}
```

## 5. LoggingInterceptor (abstract, from `@kavri/log`)

`@kavri/log` provides an abstract base for logging interceptors. Consumers (like `@kavri/web`) implement it.

```ts
abstract class LoggingInterceptor {
    /** Called before the request is processed. Returns context to pass to onComplete/onError. */
    abstract onRequest(): Record<string, unknown>;

    /** Called after successful completion. */
    abstract onComplete(context: Record<string, unknown>, result: unknown): void;

    /** Called on error. */
    abstract onError(context: Record<string, unknown>, error: unknown): void;
}
```

### WebLoggingInterceptor (from `@kavri/web`)

Implements `LoggingInterceptor` for HTTP requests. Touched by `WebApplication`.

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class WebLoggingInterceptor extends Interceptor {
    constructor(private readonly logger = injectLogger(WebLoggingInterceptor)) {}

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();

        // Set logging context for downstream loggers
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

When the logger writes an entry, it checks `kLogging` from `RequestContext` and merges the data automatically. No coupling between `@kavri/log` and `@kavri/web` — `kLogging` is just a `RequestContext.key` that the logger reads if active.

```ts
// Logger internally:
log(level, data, msg) {
    if (RequestContext.isActive()) {
        const extra = kLogging.get();
        if (extra) data = { ...extra, ...data };
    }
    // write to configured destination (stdout, file, etc.)
    this.write(level, data, msg);
}
```

## 6. ESLint

`injectLogger` is in `@kavri/eslint-plugin` affected functions list.

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
        // Inside request: { requestId, method, url, name: 'OrderService', userId }
        // Outside (CLI): { name: 'OrderService', userId }
    }
}
```

```yaml
# config/config.yaml
kavri:
  log:
    format: json
    level: info
    output: stdout
    outputs:
      error: ./logs/error.log
      fatal: ./logs/fatal.log
    redact:
      - password
      - "*.secret"
      - headers.authorization
```

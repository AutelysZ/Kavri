# Logging Module Design

Package: `@kavri/log` — depends on `@kavri/core` and `@kavri/config`. Does NOT depend on `@kavri/web`.

## 1. Principles

- **Structured logging.** JSON by default. Pretty-print for development.
- **Contextual loggers.** `injectLogger(name?)` creates named child loggers.
- **Provider-based.** `LoggingProvider` abstraction — built-in `kavri` provider included. Third-party providers (Pino, Winston) via `@Component('name')`.
- **Configurable.** Format, level, output destinations, redaction — all via `@Configuration('kavri.log')`.

## 2. Configuration

```ts
enum Format {
    JSON = 'json',
    Pretty = 'pretty',
}

enum Level {
    Trace = 'trace',
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Fatal = 'fatal',
    Silent = 'silent',
}

@Configuration('kavri.logging')
class LoggingOptions {
    /** Logging provider name. Default: 'kavri' (built-in). */
    @IsString({ default: 'kavri' })
    provider!: string;

    /** Log format. */
    @IsEnum(Format, { default: Format.JSON })
    format!: Format;

    /** Minimum log level. */
    @IsEnum(Level, { default: Level.Info })
    level!: Level;

    /** Default output destinations. 'stdout', 'stderr', or file paths. */
    @IsArray(IsString(), { default: ['stdout'] })
    output!: string[];

    /**
     * Per-level output overrides. Key = level name, value = destinations.
     * Levels not listed use `output`.
     * Example: { error: ['stderr', './logs/error.log'] }
     */
    @IsRecord(IsArray(IsString()), { optional: true })
    outputs?: Record<string, string[]>;

    /** Paths to redact from log output. Supports wildcards. */
    @IsArray(IsString(), { optional: true })
    redact?: string[];
}
```

## 3. Logger (interface)

```ts
interface Logger {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    fatal(msg: string, ...args: unknown[]): void;

    /** Create a named child logger. */
    child(name: string): Logger;
}
```

## 4. LoggingProvider

Abstract provider. Subclasses must be `@Component('name')`. Selected by `LoggingOptions.provider`.

```ts
abstract class LoggingProvider {
    /** Create the root logger from configuration. May be async (e.g., open file handles). */
    abstract createLogger(config: LoggingOptions): Awaitable<Logger>;
}
```

### Built-in: KavriLoggingProvider

```ts
@Component('kavri')
class KavriLoggingProvider extends LoggingProvider {
    async createLogger(config: LoggingOptions): Promise<Logger> {
        // Built-in structured logger:
        // - JSON or pretty format
        // - Writes to stdout/stderr/file based on config.output and config.outputs
        // - Applies redaction rules
        // - child(name) returns a logger that prefixes entries with the name
    }
}
```

Third-party: `@kavri/pino` provides `@Component('pino') class PinoLoggingProvider`, etc.

## 5. LoggerFactory

Internal `@Component` that bootstraps the root logger and creates child loggers.

```ts
@Component()
class LoggerFactory {
    private rootLogger!: Logger;

    constructor(
        private readonly config = injectConfig(LoggingOptions),
        private readonly provider = inject(LoggingProvider, injectConfig(LoggingOptions).provider),
    ) {}

    @OnConstruct()
    async init() {
        this.rootLogger = await this.provider.createLogger(this.config);
    }

    /** Get the root logger. */
    getLogger(): Logger {
        return this.rootLogger;
    }

    /** Get a named child logger. */
    getLogger(name: string): Logger {
        return this.rootLogger.child(name);
    }
}
```

## 6. Injection

### injectLogger(name?) — the only injection API

```ts
declare function injectLogger(context?: string | object | AnyConstructor<any>): Logger;
```

- `injectLogger()` → root logger
- `injectLogger('payment')` → child logger with name `'payment'`
- `injectLogger(PaymentService)` → child logger with name `'PaymentService'` (from class name)
- `injectLogger({ service: 'payment', version: '1.0' })` → child logger with those fields

`injectLogger` is an inject point.

```ts
@Component()
class PaymentService {
    constructor(private readonly logger = injectLogger(PaymentService)) {}

    async process(orderId: string) {
        this.logger.info('processing payment for order %s', orderId);
    }
}
```

## 7. LoggingInterceptor (abstract, from `@kavri/log`)

Abstract base for logging interceptors. Consumers (like `@kavri/web`) implement it.

```ts
abstract class LoggingInterceptor {
    abstract onRequest(): Record<string, unknown>;
    abstract onComplete(context: Record<string, unknown>, result: unknown): void;
    abstract onError(context: Record<string, unknown>, error: unknown): void;
}
```

### WebLoggingInterceptor (from `@kavri/web`)

Touched by `WebApplication`.

```ts
@Component()
@Priority(Interceptor.BOOTSTRAP)
class WebLoggingInterceptor extends Interceptor {
    constructor(private readonly logger = injectLogger('WebLoggingInterceptor')) {}

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();

        kLogging.set({
            requestId,
            method: req.method,
            url: req.url,
        });

        const start = Date.now();
        try {
            const result = await next();
            this.logger.info('request completed in %dms', Date.now() - start);
            return result;
        } catch (err) {
            this.logger.error('request failed in %dms: %s', Date.now() - start, (err as Error).message);
            throw err;
        }
    }
}
```

When the logger writes, it checks `kLogging` from `RequestContext` and merges the data:

```ts
// Logger internally:
log(level, msg, ...args) {
    if (RequestContext.isActive()) {
        const extra = kLogging.get();
        // merge extra fields into the log entry
    }
    this.write(level, msg, args);
}
```

## 8. ESLint

`injectLogger` is in `@kavri/eslint-plugin` affected functions list.

## 9. Example

```ts
import { Component, inject } from '@kavri/core';
import { injectLogger } from '@kavri/log';

@Component()
class OrderService {
    constructor(
        private readonly logger = injectLogger('OrderService'),
        private readonly paymentService = inject(PaymentService),
    ) {}

    async createOrder(userId: string) {
        this.logger.info('creating order for user %s', userId);
    }
}
```

```yaml
# config/config.yaml
kavri:
  logging:
    provider: kavri
    format: json
    level: info
    output:
      - stdout
    outputs:
      error:
        - stderr
        - ./logs/error.log
      fatal:
        - stderr
        - ./logs/fatal.log
    redact:
      - password
      - "*.secret"
      - headers.authorization
```

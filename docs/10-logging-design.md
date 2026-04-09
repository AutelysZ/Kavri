# Logging Module Design

Package: `@kavri/logging` — depends on `@kavri/container` and `@kavri/config`. Does NOT depend on `@kavri/web`.

## 1. Principles

- **Structured logging.** JSON by default. Pretty-print for development.
- **Contextual loggers.** `injectLogger(context?)` creates named child loggers.
- **Provider-based.** `LoggingProvider` creates `RawLogger` — the minimal output interface. Built-in `kavri` provider included.
- **Interceptable.** `LoggingInterceptor` modifies log entries before they reach the `RawLogger`.
- **Configurable.** Format, level, output destinations, redaction — all via `@Configuration('kavri.logging')`.

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
     */
    @IsRecord(IsArray(IsString()), { optional: true })
    outputs?: Record<string, string[]>;

    /** Paths to redact from log output. Supports wildcards. */
    @IsArray(IsString(), { optional: true })
    redact?: string[];
}
```

## 3. Core Types

### LoggingContext

The data structure that flows through interceptors to the raw logger.

```ts
interface LoggingContext {
    level: Level;
    message: string;
    args: any[];
    /** Extra fields. Includes 'name' if set via child(). */
    fields: Record<string, unknown>;
    /** Timestamp. Set by LoggerWrapper before interceptors. */
    timestamp: number;
}
```

### Logger (interface)

What users interact with. Returned by `injectLogger()`.

```ts
interface Logger {
    trace(msg: string, ...args: unknown[]): void;
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
    fatal(msg: string, ...args: unknown[]): void;

    child(context?: string | object | AnyConstructor<any>): Logger;
}
```

### RawLogger (interface)

The minimal output interface. Created by `LoggingProvider`. Receives finalized `LoggingContext` after interceptors.

```ts
interface RawLogger {
    log(context: LoggingContext): void;
}
```

## 4. LoggingProvider

Abstract. Subclasses must be `@Component('name')`. Selected by `LoggingOptions.provider`.

```ts
abstract class LoggingProvider {
    abstract createLogger(config: LoggingOptions): Awaitable<RawLogger>;
}
```

### Built-in: KavriLoggingProvider

```ts
@Component('kavri')
class KavriLoggingProvider extends LoggingProvider {
    async createLogger(config: LoggingOptions): Promise<RawLogger> {
        // Built-in implementation:
        // - JSON or pretty format
        // - Writes to stdout/stderr/files based on config.output and config.outputs
        // - Applies redaction rules
    }
}
```

## 5. LoggingInterceptor

Modifies log entries before they reach the `RawLogger`. Discovered via `injectAll(LoggingInterceptor)`.

```ts
abstract class LoggingInterceptor {
    /**
     * Intercept a log entry. Return modified context, or undefined to suppress.
     */
    abstract intercept(context: LoggingContext): LoggingContext | undefined;
}
```

Example — inject request data from `@kavri/web`:

```ts
// In @kavri/web
@Component()
class WebLogEnricher extends LoggingInterceptor {
    intercept(context: LoggingContext): LoggingContext | undefined {
        if (AsyncContext.isActive()) {
            const extra = kLogging.get();
            if (extra) {
                context.fields = { ...extra, ...context.fields };
            }
        }
        return context;
    }
}
```

Example — suppress noisy logs:

```ts
@Component()
class HealthCheckFilter extends LoggingInterceptor {
    intercept(context: LoggingContext): LoggingContext | undefined {
        if (context.message.includes('/health')) return undefined; // suppress
        return context;
    }
}
```

## 6. LoggerWrapper

Not a `@Component`. Created by `LoggerFactory` for each `injectLogger()` call. Implements `Logger`. Wraps a `RawLogger` and runs interceptors.

```ts
class LoggerWrapper implements Logger {
    constructor(
        private readonly raw: RawLogger,
        private readonly interceptors: readonly LoggingInterceptor[],
        private readonly fields: Record<string, unknown> = {},
    ) {}

    info(msg: string, ...args: unknown[]) {
        this.dispatch(Level.Info, msg, args);
    }
    // trace, debug, warn, error, fatal — same pattern

    child(context?: string | object | AnyConstructor<any>): Logger {
        if (!context) return this;
        const extra = typeof context === 'string' ? { name: context }
            : typeof context === 'function' ? { name: context.name }
            : context;
        return new LoggerWrapper(this.raw, this.interceptors, {
            ...this.fields,
            ...extra,
        });
    }

    private dispatch(level: Level, message: string, args: any[]) {
        let ctx: LoggingContext | undefined = {
            level,
            message,
            args,
            fields: { ...this.fields },
            timestamp: Date.now(),
        };

        for (const interceptor of this.interceptors) {
            ctx = interceptor.intercept(ctx);
            if (!ctx) return;
        }

        this.raw.log(ctx);
    }
}
```

## 7. LoggerFactory

Internal `@Component`. Creates the root `LoggerWrapper`.

```ts
@Component()
class LoggerFactory {
    private wrapper!: LoggerWrapper;

    constructor(
        private readonly config = injectConfig(LoggingOptions),
        private readonly provider = inject(LoggingProvider, injectConfig(LoggingOptions).provider),
        private readonly interceptors = injectAll(LoggingInterceptor),
    ) {}

    @OnConstruct()
    async init() {
        const raw = await this.provider.createLogger(this.config);
        this.wrapper = new LoggerWrapper(raw, this.interceptors);
    }

    getLogger(context?: string | object | AnyConstructor<any>): Logger {
        return this.wrapper.child(context);
    }
}
```

## 8. Injection

```ts
declare function injectLogger(context?: string | object | AnyConstructor<any>): Logger;
```

- `injectLogger()` → root logger
- `injectLogger('payment')` → child with name `'payment'`
- `injectLogger(PaymentService)` → child with name `'PaymentService'`
- `injectLogger({ service: 'payment', version: '1.0' })` → child with extra fields

`injectLogger` is an inject point. Internally calls `LoggerFactory.getLogger(context)`.

```ts
@Component()
class PaymentService {
    constructor(private readonly logger = injectLogger(PaymentService)) {}

    async process(orderId: string) {
        this.logger.info('processing payment for order %s', orderId);
    }
}
```

## 9. ESLint

`injectLogger` is in `@kavri/eslint-plugin` affected functions list.

## 10. Example

```ts
import { Component, inject } from '@kavri/container';
import { injectLogger } from '@kavri/logging';

@Component()
class OrderService {
    constructor(
        private readonly logger = injectLogger(OrderService),
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
    redact:
      - password
      - "*.secret"
      - headers.authorization
```

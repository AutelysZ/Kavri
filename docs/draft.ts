export {}

// ============================================================
// Section 1: Core Types
// ============================================================

type Qualifier = string | symbol;
type ProviderScope = 'singleton' | 'scoped' | 'transient';
type Awaitable<T> = T | Promise<T>;
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

type AnyConstructor<T> = abstract new (...args: any[]) => T;

type NoArgsMethodKeyof<T> = T extends object
    ? { [P in keyof T]-?: T[P] extends () => any ? P : never; }[keyof T]
    : never;

type DecoratorStatic<T> = {
    readonly __metadata__: T | undefined;
}

type ClassDecorator<T> =
    globalThis.ClassDecorator
    & ((target: Function, context: ClassDecoratorContext) => void)
    & DecoratorStatic<T>;

type MethodDecorator<T> =
    globalThis.MethodDecorator
    & ((target: Function, context: ClassMethodDecoratorContext) => void)
    & DecoratorStatic<T>;

type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>
type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>

declare function createClassDecorator<T>(factory: ClassDecoratorFactory<T>, metadata: T, extra?: ClassDecorator<any>[]): ClassDecorator<T>;
declare function createMethodDecorator<T>(factory: MethodDecoratorFactory<T>, metadata: T, extra?: MethodDecorator<any>[]): MethodDecorator<T>;

// ============================================================
// Section 2: Component Decorator
// ============================================================

interface ComponentOptions {
    name?: Qualifier;
    scope?: ProviderScope;
    condition?: () => Awaitable<boolean>;
}

interface ComponentMetadata {
    options: ComponentOptions;
}

/**
 * Marks a class as a container-managed component.
 * Constructor parameters use default values with inject() for dependency injection.
 *
 * @example
 * @Component()
 * class UserService {
 *     constructor(private readonly db = inject(Database)) {}
 * }
 *
 * @Component({ name: 'mysql', scope: 'singleton' })
 * class MysqlDriver extends Driver { ... }
 */
declare function Component(options?: ComponentOptions): ClassDecorator<ComponentMetadata>;

// ============================================================
// Section 3: Lifecycle Decorators
// ============================================================

/** Called after construction and injection. May be async. */
declare function OnConstruct(): MethodDecorator<{}>;

/** Called during container/scope destroy, in reverse dependency order. */
declare function OnDestroy(): MethodDecorator<{}>;

// ============================================================
// Section 4: Providers — Token & Computed
// ============================================================

declare class Token<T> {
    readonly factory: () => Awaitable<T>;
}

/**
 * Creates a typed token with a factory default.
 * The factory runs in an inject context.
 *
 * @example
 * const AppName = token<string>(() => 'my-app');
 * const DbUrl = token<string>((config = inject(DatabaseConfig)) => config.url);
 */
declare function token<T>(factory: () => Awaitable<T>, options?: ProvideOptions<T>): Token<T>;

declare class Computed<T> {
    readonly resolve: () => Awaitable<T>;
}

/**
 * Creates a computed injectable. The resolver runs in an inject context.
 *
 * @example
 * const SelectedDriver = computed<Driver>(
 *     (config = inject(DbConfig), driver = inject(Driver, config.driver)) => driver
 * );
 */
declare function computed<T>(resolve: () => Awaitable<T>): Computed<T>;

// ============================================================
// Section 5: Providers — @Provide & @Decorate
// ============================================================

interface ProvideOptions<T> extends ComponentOptions {
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

interface ProvideMetadata<T> extends ProvideOptions<T> {
    injectable: Injectable<T>;
    factory: () => Awaitable<T>;
}

/**
 * Class decorator: registers a provider for a class or token.
 * Multiple @Provide decorators can be stacked.
 * Providers are registered when the class is used (via @Use).
 *
 * @example
 * @Component()
 * @Provide(Sequelize, (url = inject(DbUrl)) => new Sequelize(url), { onDestroy: 'close' })
 * class InfraModule {}
 */
declare function Provide<T>(
    target: Injectable<T>,
    factory: () => Awaitable<T>,
    options?: ProvideOptions<T>,
): ClassDecorator<ProvideMetadata<T>>;

interface DecorateMetadata<T> {
    target: Injectable<T>;
    decorator: (previous: T) => Awaitable<T>;
}

/**
 * Class decorator: wraps an existing provider.
 * If the target has no provider, the decoration is silently ignored.
 * Applied after the provider's @OnConstruct, in registration order.
 *
 * @example
 * @Component()
 * @Decorate(ConfigOptions, (prev) => ({ ...prev, configFiles: ['app.yaml'] }))
 * class AppConfigModule {}
 */
declare function Decorate<T>(
    target: Injectable<T>,
    decorator: (previous: T) => Awaitable<T>,
): ClassDecorator<DecorateMetadata<T>>;

// ============================================================
// Section 6: Injectable Type & Injection APIs
// ============================================================

/** Union of all injectable targets. */
type Injectable<T> = AnyConstructor<T> | Token<T> | Computed<T>;

declare class Ref<T> {
    /** Returns the resolved instance. Throws if accessed during construction. */
    get(): T;
}

/**
 * Injects a dependency. MUST only be called in inject points via default parameters:
 *   1. @Component class constructors
 *   2. token() factory functions
 *   3. computed() resolve functions
 *   4. @Provide / @Decorate factory parameters
 *   5. ComponentOptions.condition functions
 *
 * Async resolution: Suspense-style. If a dependency is not ready, inject() throws
 * a Promise. The container catches it, awaits, re-invokes the factory. Repeats
 * until all dependencies resolve synchronously.
 *
 * Injecting a target with no registered provider throws MissingProviderError
 * (unless optional).
 */
declare function inject<T>(injectable: Injectable<T>): T
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined

declare function injectRef<T>(injectable: Injectable<T>): Ref<T>
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined

/**
 * Injects all @Component-decorated subclasses/implementations of the target,
 * or all classes decorated with a specific ClassDecoratorFactory.
 * Only components that are touched/registered in the container are included.
 */
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, order?: CollectionOrder): readonly T[]

/** Injects all implementations as a ReadonlySet. */
declare function injectSet<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlySet<T>;

/** Injects all implementations as a Map keyed by their Qualifier (component name). */
declare function injectMap<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlyMap<Qualifier, T>;

// ============================================================
// Section 7: Metadata
// ============================================================

/**
 * Reads and writes decorator metadata.
 *
 * Metadata.of() returns readonly T[] because a decorator can be applied
 * multiple times (e.g., multiple @Provide on one class).
 *
 * Metadata.apply() programmatically attaches metadata (push, not replace).
 */
declare const Metadata: {
    of<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>): readonly T[];
    of<T>(factory: ClassDecoratorFactory<T>, instance: object): readonly T[];
    of<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier): readonly T[];
    of<T>(factory: MethodDecoratorFactory<T>, instance: object, key: Qualifier): readonly T[];
    of<T>(factory: MethodDecoratorFactory<T>, method: Function): readonly T[];

    apply<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>, metadata: T): void;
    apply<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier, metadata: T): void;
}

// ============================================================
// Section 8: Module System — @Touch & @Use
// ============================================================

/**
 * Class decorator: makes the container aware of the listed injectables
 * without instantiating them. Like Unix `touch`.
 *
 * Needed for collection injection (injectAll/injectSet/injectMap)
 * where each implementation must be explicitly touched.
 */
declare function Touch(...injectables: Injectable<any>[]): ClassDecorator<readonly Injectable<any>[]>;

/**
 * Class decorator: ensures the listed injectables are instantiated
 * (and their @Provide/@Decorate processed) before this class is resolved.
 */
declare function Use(...injectables: Injectable<any>[]): ClassDecorator<readonly Injectable<any>[]>;

// ============================================================
// Section 9: Container & Scope
// ============================================================

/**
 * The root IoC container.
 *
 * All configuration is done via decorators on @Component classes:
 * @Provide, @Decorate, @Touch, @Use. The container only resolves and destroys.
 *
 * Typical lifecycle:
 *   1. new Container()
 *   2. resolve(entrypoint) to bootstrap
 *   3. destroy() for graceful shutdown
 *
 * Resolution order for container.resolve(target):
 *   All @Use deps and target are treated as entrypoints.
 *   The container instantiates them serially in order: ...deps, target.
 *   For each target being instantiated:
 *     1. Find the last registered provider (factory) for it.
 *     2. Call the factory (inject context active for default params).
 *     3. Call onConstruct / @OnConstruct() on the instance.
 *     4. Apply all @Decorate wrappers in registration order.
 *     5. Mark the target as instantiated.
 *
 * @Decorate on a target without a provider is silently ignored.
 */
declare class Container {
    /** Resolve an injectable. Triggers the full instantiation chain. */
    resolve<T>(injectable: Injectable<T>): Promise<T>;

    /** Create a child scope. Scoped: fresh per scope. Singleton: shared. Transient: always fresh. */
    createScope(name?: string): Scope;

    /** Destroy. Calls @OnDestroy in reverse dependency order. */
    destroy(): Promise<void>;
}

declare class Scope {
    resolve<T>(injectable: Injectable<T>): Promise<T>;
    destroy(): Promise<void>;
}

// ============================================================
// Section 10: Event System
// ============================================================

/**
 * Marks a class as an event type. Required for class-based events.
 * Emitting an instance of an undecorated class is a runtime error.
 */
declare function EventType(name?: string): ClassDecorator<{ name: string | undefined }>;

/** Marks a method as a listener. Listeners are called in dependency order. */
declare function OnEvent<T>(event: AnyConstructor<T> | EventKey<T>): MethodDecorator<{
    event: AnyConstructor<T> | EventKey<T>
}>;

/** A typed event key for key-based events (no class needed). */
declare class EventKey<T> {
    readonly name?: string;
    private readonly __brand: T;
}

/** Creates a typed event key. */
declare function defineEvent<T>(name?: string): EventKey<T>;

/** Built-in component. Inject via inject(EventBus). emit() waits for all listeners. */
declare class EventBus {
    emit<T extends object>(event: T): Promise<void>;
    emit<T>(key: EventKey<T>, data: T): Promise<void>;
}

// ============================================================
// Section 11: Configuration
// ============================================================

declare type ZodSchema<T> = unknown;
declare const z: any;

interface ConfigOptions {
    configFiles: string[];
    env: Record<string, string>;
    argv: string[];
    envPrefix: string;
    argvPrefix: string;
}

declare const ConfigOptions: Token<ConfigOptions>;

interface ConfigurationMetadata<T> {
    prefix: string;
    schema: ZodSchema<T>;
}

/** Marks a token as a configuration schema. Used internally by createConfigSchema(). */
declare function Configuration<T>(prefix: string, schema: ZodSchema<T>): ClassDecorator<ConfigurationMetadata<T>>;

/**
 * Creates a config token bound to a prefix.
 * Returns a Token<T> decorated with @Configuration.
 *
 * Internally, the token's factory depends on ConfigRegistry (which uses
 * ConfigOptions to load all config sources as raw key-value pairs).
 * The factory parses the node at `prefix` using the zod schema.
 *
 * Source precedence (highest → lowest):
 *   1. @Provide runtime overrides
 *   2. CLI arguments (matched by argvPrefix)
 *   3. Environment variables (matched by envPrefix)
 *   4. Config files (yaml/json/toml)
 *   5. Zod schema defaults
 *
 * @example
 * const DatabaseConfig = createConfigSchema('database', z.object({
 *     driver: z.string(),
 *     host: z.string(),
 *     port: z.number().default(5432),
 * }));
 */
declare function createConfigSchema<T>(prefix: string, schema: ZodSchema<T>): Token<T>;

// ============================================================
// Section 12: Error Types
// ============================================================

/** Thrown when a circular dependency is detected during resolution. */
declare class CircularDependencyError extends Error {
    readonly chain: Injectable<any>[];
}

/** Thrown when inject() is called for a target with no registered provider (non-optional). */
declare class MissingProviderError extends Error {
    readonly injectable: Injectable<any>;
}

/** Thrown when inject() is called outside a valid inject point. */
declare class InjectContextError extends Error {}

/** Thrown when a scoped provider is resolved from the root container. */
declare class ScopeError extends Error {
    readonly injectable: Injectable<any>;
}

/** Thrown when the container is used after destroy(). */
declare class DestroyedContainerError extends Error {}

/** Thrown when a config schema fails zod validation during resolution. */
declare class ConfigValidationError extends Error {
    readonly prefix: string;
    readonly issues: unknown;
}


// ============================================================
// ============================================================
//
//   E X A M P L E S
//
// ============================================================
// ============================================================


// ============================================================
// Example: Custom Decorator Creation
// ============================================================

// Class decorator — @Controller composes @Component
interface ControllerMetadata {
    path: string;
}

function Controller(path: string, options?: ComponentOptions): ClassDecorator<ControllerMetadata> {
    return createClassDecorator<ControllerMetadata>(Controller, {path}, [Component(options)])
}

// Method decorator — @RateLimit
interface RateLimitMetadata {
    maxRequests: number;
    windowMs: number;
}

function RateLimit(opts: RateLimitMetadata): MethodDecorator<RateLimitMetadata> {
    return createMethodDecorator<RateLimitMetadata>(RateLimit, opts);
}

// Reading metadata
// Metadata.of(Controller, UserController);          // [{ path: '/users' }]
// Metadata.of(Component, UserController);           // [{ options: {} }] — also a Component via compose
// Metadata.of(RateLimit, ApiService, 'search');     // [{ maxRequests: 100, windowMs: 60000 }]


// ============================================================
// Example 1: Basic Components and Injection
// ============================================================

@Component()
class Logger {
    info(message: string): void {}
    error(message: string, err?: Error): void {}
}

@Component()
class UserRepository {
    findById(id: string): Promise<any> { return Promise.resolve(); }
    findAll(): Promise<any[]> { return Promise.resolve([]); }
    save(user: any): Promise<void> { return Promise.resolve(); }
}

@Component()
class UserService {
    constructor(
        private readonly logger = inject(Logger),
        private readonly repo = inject(UserRepository),
    ) {}

    async getUser(id: string) {
        this.logger.info(`Fetching user ${id}`);
        return this.repo.findById(id);
    }
}


// ============================================================
// Example 2: Named Components and Collections
// ============================================================

abstract class Serializer {
    abstract contentType(): string;
    abstract serialize(data: any): string;
    abstract deserialize(raw: string): any;
}

@Component({name: 'json'})
class JsonSerializer extends Serializer {
    contentType() { return 'application/json'; }
    serialize(data: any) { return JSON.stringify(data); }
    deserialize(raw: string) { return JSON.parse(raw); }
}

@Component({name: 'xml'})
class XmlSerializer extends Serializer {
    contentType() { return 'text/xml'; }
    serialize(data: any) { return '<data/>'; }
    deserialize(raw: string) { return {}; }
}

@Component({name: 'yaml'})
class YamlSerializer extends Serializer {
    contentType() { return 'text/yaml'; }
    serialize(data: any) { return ''; }
    deserialize(raw: string) { return {}; }
}

@Component()
class DataExporter {
    constructor(
        private readonly json = inject(Serializer, 'json'),
        private readonly allSerializers = injectAll(Serializer, 'alphabetical'),
        private readonly serializerMap = injectMap(Serializer),
        private readonly serializerSet = injectSet(Serializer),
    ) {}

    export(data: any, format: string): string {
        const serializer = this.serializerMap.get(format);
        if (!serializer) throw new Error(`Unknown format: ${format}`);
        return serializer.serialize(data);
    }

    supportedFormats(): string[] {
        return this.allSerializers.map(s => Metadata.of(Component, s)[0].options.name as string);
    }
}


// ============================================================
// Example 3: Token Providers
// ============================================================

const AppName = token<string>(() => 'kavri-app');

const DatabaseConfig = createConfigSchema<{
    driver: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}>('database', z.object({
    driver: z.string(),
    host: z.string(),
    port: z.number().default(5432),
    username: z.string(),
    password: z.string(),
    database: z.string(),
}));

const DatabaseUrl = token<string>(
    (config = inject(DatabaseConfig)) => `${config.driver}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`
);

declare class ExternalHttpClient {
    constructor(baseUrl: string);
    get(path: string): Promise<any>;
    close(): Promise<void>;
}

const HttpClient = token<ExternalHttpClient>(
    (name = inject(AppName)) => new ExternalHttpClient(`https://api.example.com/${name}`),
    {onDestroy: (client) => client.close()}
);

const SecretKey = token<string>(() => {
    throw new Error('SecretKey must be provided via @Provide');
});


// ============================================================
// Example 4: Computed Providers
// ============================================================

abstract class Driver<TConn> {
    abstract connect(): Promise<TConn>;
    abstract execute<T>(conn: TConn, sql: string, values: any[]): Promise<T[]>;
    abstract close(conn: TConn): Promise<void>;
}

@Component({name: 'mysql'})
class MysqlDriver extends Driver<unknown> {
    connect() { return Promise.resolve(undefined); }
    execute<T>(conn: unknown, sql: string, values: any[]) { return Promise.resolve<T[]>([]); }
    close(conn: unknown) { return Promise.resolve(); }
}

@Component({name: 'psql'})
class PsqlDriver extends Driver<unknown> {
    connect() { return Promise.resolve(undefined); }
    execute<T>(conn: unknown, sql: string, values: any[]) { return Promise.resolve<T[]>([]); }
    close(conn: unknown) { return Promise.resolve(); }
}

const SelectedDriver = computed<Driver<any>>(
    (config = inject(DatabaseConfig), driver = inject(Driver, config.driver)) => driver
);

const Connection = token<any>(
    (driver = inject(SelectedDriver)) => driver.connect(),
);


// ============================================================
// Example 5: @Provide & @Decorate
// ============================================================

declare class Sequelize {
    constructor(url: string, options?: any);
    authenticate(): Promise<void>;
    close(): Promise<void>;
    query(sql: string): Promise<any>;
}

declare class Redis {
    connect(url: string): Promise<void>;
    disconnect(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
}

const RedisConfig = createConfigSchema<{ url: string }>('redis', z.object({
    url: z.string(),
}));

@Component()
@Provide(Sequelize, async (url = inject(DatabaseUrl)) => {
    const seq = new Sequelize(url, {logging: false});
    await seq.authenticate();
    return seq;
}, {onDestroy: 'close'})
@Provide(Redis, async (config = inject(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, {onDestroy: 'disconnect'})
class InfraModule {}

@Component()
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml', 'config/app.local.yaml'],
    envPrefix: 'MYAPP_',
}))
class AppConfigModule {}


// ============================================================
// Example 6: Circular References
// ============================================================

@Component()
class OrderService {
    constructor(private readonly inventoryRef: Ref<InventoryService> = injectRef(InventoryService)) {}

    async createOrder(productId: string, qty: number) {
        const available = await this.inventoryRef.get().checkStock(productId, qty);
        if (!available) throw new Error('Insufficient stock');
    }
}

@Component()
class InventoryService {
    constructor(private readonly orderRef: Ref<OrderService> = injectRef(OrderService)) {}

    async checkStock(productId: string, qty: number): Promise<boolean> {
        return Promise.resolve(true);
    }
}


// ============================================================
// Example 7: Scoped Providers
// ============================================================

@Component({scope: 'scoped'})
class RequestContext {
    readonly requestId = Math.random().toString(36).slice(2);
}

@Component({scope: 'transient'})
class TraceSpan {
    readonly spanId = Math.random().toString(36).slice(2);
}


// ============================================================
// Example 8: Lifecycle Hooks
// ============================================================

@Component()
class ConnectionPool {
    private pool: any;

    @OnConstruct()
    async init() { this.pool = {}; }

    @OnDestroy()
    async drain() {}
}


// ============================================================
// Example 9: Conditional Components
// ============================================================

const TelemetryConfig = createConfigSchema<{
    enabled: boolean;
    endpoint: string;
}>('telemetry', z.object({
    enabled: z.boolean().default(false),
    endpoint: z.string().optional(),
}));

@Component({
    condition: (config = inject(TelemetryConfig, true)) => config?.enabled ?? false,
})
class TelemetryService {
    constructor(private readonly config = inject(TelemetryConfig)) {}
    send(metric: string, value: number): void {}
}

@Component()
class AppService {
    constructor(private readonly telemetry = inject(TelemetryService, true)) {}
    doWork() { this.telemetry?.send('work.done', 1); }
}


// ============================================================
// Example 10: Event System
// ============================================================

@EventType('job.started')
class JobStartedEvent {
    constructor(public readonly jobId: string, public readonly startedAt: number = Date.now()) {}
}

@EventType('job.completed')
class JobCompletedEvent {
    constructor(public readonly jobId: string, public readonly result: any) {}
}

@EventType('job.failed')
class JobFailedEvent {
    constructor(public readonly jobId: string, public readonly error: Error) {}
}

const CacheInvalidated = defineEvent<{ key: string; reason: string }>('cache.invalidated');
const SystemShutdown = defineEvent<{ timeout: number }>('system.shutdown');

@Component()
class JobMetricsListener {
    constructor(private readonly telemetry = inject(TelemetryService, true)) {}

    @OnEvent(JobStartedEvent)
    onJobStarted(ev: JobStartedEvent) { this.telemetry?.send('job.started', 1); }

    @OnEvent(JobCompletedEvent)
    onJobCompleted(ev: JobCompletedEvent) { this.telemetry?.send('job.completed', 1); }

    @OnEvent(JobFailedEvent)
    onJobFailed(ev: JobFailedEvent) { this.telemetry?.send('job.failed', 1); }
}

@Component()
class CacheManager {
    private readonly cache = new Map<string, any>();

    @OnEvent(CacheInvalidated)
    onCacheInvalidated(data: { key: string; reason: string }) { this.cache.delete(data.key); }

    @OnEvent(SystemShutdown)
    onShutdown(data: { timeout: number }) { this.cache.clear(); }
}

@Component()
class JobRunner {
    constructor(private readonly events = inject(EventBus)) {}

    async run(jobId: string) {
        await this.events.emit(new JobStartedEvent(jobId));
        try {
            const result = {};
            await this.events.emit(new JobCompletedEvent(jobId, result));
        } catch (err: any) {
            await this.events.emit(new JobFailedEvent(jobId, err));
            throw err;
        }
    }

    async invalidateCache(key: string) {
        await this.events.emit(CacheInvalidated, {key, reason: 'manual'});
    }
}


// ============================================================
// Example 11: Configuration
// ============================================================

const AppConfig = createConfigSchema<{
    name: string;
    env: string;
    debug: boolean;
    maxRetries: number;
}>('app', z.object({
    name: z.string().default('kavri-app'),
    env: z.enum(['dev', 'staging', 'prod']).default('dev'),
    debug: z.boolean().default(false),
    maxRetries: z.number().int().min(0).default(3),
}));

const CorsConfig = createConfigSchema<{
    origins: string[];
    methods: string[];
    credentials: boolean;
}>('cors', z.object({
    origins: z.array(z.string()).default(['*']),
    methods: z.array(z.string()).default(['GET', 'POST']),
    credentials: z.boolean().default(false),
}));

@Component()
class ConfigConsumer {
    constructor(
        private readonly dbConfig = inject(DatabaseConfig),
        private readonly appConfig = inject(AppConfig),
        private readonly corsConfig = inject(CorsConfig),
        private readonly telemetryConfig = inject(TelemetryConfig, true),
    ) {}

    isDebug(): boolean { return this.appConfig.debug; }
}

const SelectedFormat = createConfigSchema<{ format: string }>('export', z.object({
    format: z.enum(['json', 'xml', 'yaml']).default('json'),
}));

const DefaultSerializer = computed<Serializer>(
    (config = inject(SelectedFormat), s = inject(Serializer, config.format)) => s
);


// ============================================================
// Example 12: Module System
// ============================================================

@Component()
@Provide(Redis, async (config = inject(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, {onDestroy: 'disconnect'})
class CacheModule {}

@Component()
@Touch(MysqlDriver, PsqlDriver)
@Provide(Sequelize, async (url = inject(DatabaseUrl)) => {
    const seq = new Sequelize(url);
    await seq.authenticate();
    return seq;
}, {onDestroy: 'close'})
class DatabaseModule {}

@Component()
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml'],
}))
class ConfigModule {}

@Component()
class RedisEventSubscriber {
    private readonly unsub: () => void;

    constructor(
        private readonly redis = inject(Redis),
        private readonly events = inject(EventBus),
    ) {
        this.unsub = () => {};
    }

    @OnDestroy()
    dispose() { this.unsub(); }
}

@Component()
@Touch(JsonSerializer, XmlSerializer, YamlSerializer)
@Use(ConfigModule, CacheModule, DatabaseModule)
@Use(RedisEventSubscriber, JobMetricsListener)
class Application {
    constructor(
        private readonly appConfig = inject(AppConfig),
        private readonly serializers = injectAll(Serializer, 'alphabetical'),
        private readonly jobs = inject(JobRunner),
        private readonly events = inject(EventBus),
    ) {}

    @OnDestroy()
    async onShutdown() {
        await this.events.emit(SystemShutdown, {timeout: 5000});
    }
}

declare var console: { assert(value: boolean): void; }


// ============================================================
// Example 13: Testing
// ============================================================

async function testUserService() {
    @Component()
    @Provide(Logger, () => ({ info() {}, error() {} }))
    @Provide(UserRepository, () => ({
        findById: async (id: string) => ({id, name: 'Test User'}),
        findAll: async () => [{id: '1', name: 'Test User'}],
        save: async () => {},
    }))
    @Use(UserService)
    class TestHarness {
        constructor(private readonly service = inject(UserService)) {}
    }

    const container = new Container();
    const harness = await container.resolve(TestHarness);
    const user = await harness.service.getUser('1');
    console.assert(user.name === 'Test User');
    await container.destroy();
}

async function testConditionalComponent() {
    @Component()
    @Provide(TelemetryConfig, () => ({ enabled: true, endpoint: 'http://localhost:9090' }))
    class TestHarness {
        constructor(readonly telemetry = inject(TelemetryService)) {}
    }

    const container = new Container();
    const harness = await container.resolve(TestHarness);
    harness.telemetry.send('test.metric', 42);
    await container.destroy();
}

async function testCustomMetadata() {
    function Priority(value: number): ClassDecorator<number> {
        return createClassDecorator(Priority, value);
    }

    @Component()
    @Priority(10)
    class HighPriorityService {}

    console.assert(Metadata.of(Priority, HighPriorityService)[0] === 10);
}


// ============================================================
// Example 14: Full Application
// ============================================================

abstract class Pet {
    abstract speech(): string;
}

@Component({name: 'dog'})
class Dog extends Pet { speech() { return 'woof'; } }

@Component({name: 'cat'})
class Cat extends Pet { speech() { return 'meow'; } }

@Component({name: 'bird'})
class Bird extends Pet { speech() { return 'tweet'; } }

@Component()
abstract class Repository<T> {
    constructor(
        private readonly conn = inject(Connection),
        private readonly driver = inject(SelectedDriver),
    ) {}

    abstract tableName(): string;
    findOne(id: string): Promise<T | undefined> { return Promise.resolve(undefined); }
    findAll(): Promise<readonly T[]> { return Promise.resolve([]); }
    create(input: T): Promise<T> { return Promise.resolve(input); }
    delete(id: string): Promise<void> { return Promise.resolve(); }
}

interface PetRecord { id: string; name: string; species: string; greeting: string; }

@Component()
class PetRepository extends Repository<PetRecord> {
    tableName() { return 'pets'; }
}

const RedisUrl = token<string>((config = inject(RedisConfig)) => config.url);

@EventType('pet.adopted')
class PetAdoptedEvent {
    constructor(public readonly petId: string, public readonly species: string) {}
}

const PetStoreConfig = createConfigSchema<{
    defaultPet: string;
    maxPetsPerUser: number;
}>('petstore', z.object({
    defaultPet: z.string().default('dog'),
    maxPetsPerUser: z.number().default(5),
}));

@Component()
@Provide(Redis, async (url = inject(RedisUrl)) => {
    const redis = new Redis();
    await redis.connect(url);
    return redis;
}, {onDestroy: 'disconnect'})
class RedisModule {}

@Component()
@Touch(Dog, Cat, Bird)
@Touch(PsqlDriver)
@Use(RedisModule)
@Use(RedisEventSubscriber, JobMetricsListener)
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml', 'config/app.local.yaml'],
    envPrefix: 'PETSTORE_',
}))
class PetStoreApplication {
    constructor(
        private readonly config = inject(PetStoreConfig),
        private readonly appConfig = inject(AppConfig),
        private readonly petRepo = inject(PetRepository),
        private readonly allPets = injectAll(Pet, 'alphabetical'),
        private readonly defaultPet = inject(Pet, config.defaultPet),
        private readonly events = inject(EventBus),
        private readonly telemetry = inject(TelemetryService, true),
    ) {}

    @OnConstruct()
    async init() {}

    async adoptPet(userId: string, species: string): Promise<PetRecord> {
        const pet = this.allPets.find(p => Metadata.of(Component, p)[0].options.name === species);
        if (!pet) throw new Error(`Unknown species: ${species}`);

        const record = await this.petRepo.create({
            id: Math.random().toString(36).slice(2),
            name: species,
            species,
            greeting: pet.speech(),
        });

        await this.events.emit(new PetAdoptedEvent(record.id, species));
        return record;
    }

    @OnDestroy()
    async shutdown() {
        await this.events.emit(SystemShutdown, {timeout: 5000});
    }
}

const container = new Container();
const app = await container.resolve(PetStoreApplication);
await app.adoptPet('user-1', 'cat');
await container.destroy();

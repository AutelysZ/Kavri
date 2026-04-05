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
    /**
     * Async condition evaluated lazily on first inject(). Result is cached.
     * Runs in an inject context.
     */
    condition?: () => Awaitable<boolean>;
}

interface ComponentMetadata {
    options: ComponentOptions;
}

declare function Component(options?: ComponentOptions): ClassDecorator<ComponentMetadata>;

// ============================================================
// Section 3: Lifecycle Decorators
// ============================================================

/**
 * Called after construction. May be async. Inject point — default params can use inject().
 * Multiple @OnConstruct on one class: called in declaration order, serially.
 * Return value is ignored.
 */
declare function OnConstruct(): MethodDecorator<{}>;

/**
 * Called during container/scope destroy, in reverse dependency order.
 * Inject point — default params can use inject().
 * Multiple @OnDestroy on one class: called in declaration order, serially.
 * Return value is ignored.
 */
declare function OnDestroy(): MethodDecorator<{}>;

// ============================================================
// Section 4: Providers — Token
// ============================================================

declare class Token<T> {
    private readonly __type: T;
}

/**
 * Creates a typed token with a factory default.
 * The factory runs in an inject context.
 */
declare function token<T>(factory: () => Awaitable<T>, options?: ProvideOptions<T>): Token<T>;

// ============================================================
// Section 5: Providers — @Provide
// ============================================================

interface ProvideOptions<T> extends ComponentOptions {
    /** Inject point — default params can use inject(). Return value ignored. */
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    /** Inject point — default params can use inject(). Return value ignored. */
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    /** If true, takes precedence when multiple providers exist for the same target. */
    primary?: boolean;
}

interface ProvideMetadata<T> extends ProvideOptions<T> {
    injectable: Injectable<T>;
    factory: () => Awaitable<T>;
}

/**
 * Class decorator: registers a provider for a class or token.
 * Multiple @Provide can be stacked. Providers are registered when @Use-d.
 *
 * Duplicate providers for the same target → DuplicateProviderError
 * (unless exactly one is { primary: true }).
 * @Component counts as an implicit provider — @Provide on the same target
 * requires { primary: true }.
 *
 * @Provide/@Use on a class are only processed if the class is enabled
 * (not disabled by @Component({ condition })).
 */
declare function Provide<T>(
    target: Injectable<T>,
    factory: () => Awaitable<T>,
    options?: ProvideOptions<T>,
): ClassDecorator<ProvideMetadata<T>>;

// ============================================================
// Section 6: Injectable Type & Injection APIs
// ============================================================

type Injectable<T> = AnyConstructor<T> | Token<T>;

declare class Ref<T> {
    get(): T;
}

/**
 * Injects a dependency. MUST only be called in inject points via default parameters:
 *   1. @Component class constructors
 *   2. token() factory functions
 *   3. @Provide factory parameters
 *   4. ComponentOptions.condition functions
 *   5. @OnConstruct / @OnDestroy method parameters
 *   6. onConstruct / onDestroy callback parameters (ProvideOptions)
 */
declare function inject<T>(injectable: Injectable<T>): T
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined

declare function injectRef<T>(injectable: Injectable<T>): Ref<T>
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined

declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, order?: CollectionOrder): readonly T[]
declare function injectSet<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlySet<T>;
declare function injectMap<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>): ReadonlyMap<Qualifier, T>;

// ============================================================
// Section 7: Metadata
// ============================================================

declare const Metadata: {
    /** Read class-level metadata. Returns T[] (decorator can be applied multiple times). */
    of<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>): readonly T[];
    of<T>(factory: ClassDecoratorFactory<T>, instance: object): readonly T[];

    /** Read method-level metadata. */
    of<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier): readonly T[];
    of<T>(factory: MethodDecoratorFactory<T>, instance: object, key: Qualifier): readonly T[];

    /** Programmatically attach metadata (push, not replace). */
    apply<T>(factory: ClassDecoratorFactory<T>, target: Injectable<any>, metadata: T): void;
    apply<T>(factory: MethodDecoratorFactory<T>, target: Injectable<any>, key: Qualifier, metadata: T): void;

    /**
     * Get all registered [injectable, metadata] pairs for a class decorator.
     * Returns all injectables that have been decorated with this factory.
     */
    entries<T>(factory: ClassDecoratorFactory<T>): readonly [Injectable<any>, T][];

    /**
     * Get all registered [injectable, key, metadata] triples for a method decorator.
     */
    entries<T>(factory: MethodDecoratorFactory<T>): readonly [Injectable<any>, Qualifier, T][];
}

// ============================================================
// Section 8: Module System — @Touch & @Use
// ============================================================

/**
 * Class decorator: registers listed classes without instantiating.
 * Only accepts class constructors (not tokens).
 */
declare function Touch(...classes: AnyConstructor<any>[]): ClassDecorator<readonly AnyConstructor<any>[]>;

/**
 * Class decorator: ensures listed injectables are instantiated
 * (and their @Provide processed) before this class is resolved.
 */
declare function Use(...injectables: Injectable<any>[]): ClassDecorator<readonly Injectable<any>[]>;

// ============================================================
// Section 9: Container & Scope
// ============================================================

/**
 * The root IoC container.
 *
 * Resolution order for container.resolve(target):
 *   All @Use deps and target are entrypoints, instantiated serially.
 *   For each target:
 *     1. Check condition. Disabled → skip.
 *     2. Register decorator metadata: @Touch, @Provide (pure registration).
 *        Duplicate @Provide → DuplicateProviderError (unless primary).
 *     3. Process @Use: recursively instantiate deps (depth-first).
 *     4. Call factory (inject context active).
 *     5. Call @OnConstruct methods (declaration order, serially, inject point).
 *     6. Mark instantiated.
 */
declare class Container {
    resolve<T>(injectable: Injectable<T>): Promise<T>;
    createScope(name?: string): Scope;
    destroy(): Promise<void>;
}

declare class Scope {
    resolve<T>(injectable: Injectable<T>): Promise<T>;
    destroy(): Promise<void>;
}

// ============================================================
// Section 10: Event System
// ============================================================

declare function EventType(name?: string): ClassDecorator<{ name: string | undefined }>;

declare function OnEvent<T>(event: AnyConstructor<T> | EventKey<T>, options?: { async?: boolean }): MethodDecorator<{
    event: AnyConstructor<T> | EventKey<T>;
    async: boolean;
}>;

declare class EventKey<T> {
    readonly name?: string;
    private readonly __brand: T;
}

declare function defineEvent<T>(name?: string): EventKey<T>;

declare class EventBus {
    emit<T extends object>(event: T): Promise<void>;
    emit<T>(key: EventKey<T>, data: T): Promise<void>;
}

// ============================================================
// Section 11: Configuration
// ============================================================

declare const z: any;

// --- Parser ---

/** Validation interface. Zod schemas satisfy this naturally. */
interface ConfigParser<T> {
    parse(raw: unknown): T;
}

// --- Loader ---

/**
 * Abstract file loader. Config module touches JsonLoader, YamlLoader, TomlLoader by default.
 * Subclasses must be @Component(). Third-party loaders added via @Touch.
 */
abstract class Loader {
    /** File extensions (e.g., ['.yaml', '.yml']). */
    abstract supports(): string[];
    /** Parse file content into config object. */
    abstract load(content: string): Awaitable<object>;
}

declare class JsonLoader extends Loader {}
declare class YamlLoader extends Loader {}
declare class TomlLoader extends Loader {}

// --- Resolver (import resolvers, NOT variable resolvers) ---

/**
 * Abstract import resolver for kavri.config.import entries.
 * Subclasses must be @Component({ name }) — name is the protocol selector.
 * ConfigurationRegistry uses injectMap(Resolver) to find resolvers by name.
 */
abstract class Resolver {
    /**
     * Load external values and return them as key-value pairs.
     * These are merged into the env context for ${...} substitution.
     * @param resource — the part after the protocol prefix (e.g., "my-secret?prefix=db")
     */
    abstract load(resource: string): Awaitable<Record<string, string>>;
}

// --- Bootstrap configuration ---

interface BootstrapConfigurationMetadata<T> {
    prefix: string;
    parser: ConfigParser<T>;
}

/** Marks a token as a bootstrap config (resolved before config files, no variable substitution). */
declare function BootstrapConfiguration<T>(prefix: string, parser: ConfigParser<T>): ClassDecorator<BootstrapConfigurationMetadata<T>>;

/**
 * Creates a bootstrap config token. Resolved before config files load.
 * Token is decorated with @BootstrapConfiguration.
 * Factory: (registry = inject(BootstrapConfigurationRegistry)) => registry.parse(token)
 *
 * Sources: env/cli only, no config files, no variable substitution.
 * Precedence: @Provide (escape hatch) > cli > env > @OverrideConfiguration > parser defaults
 *
 * Env mapping: prefix uppercased. 'aws' → AWS_REGION
 * CLI mapping: '--' + prefix. 'aws' → --aws.region
 */
declare function createBootstrapConfiguration<T>(prefix: string, parser: ConfigParser<T>): Token<T>;

/**
 * BootstrapOptions — bootstrap config for the config system itself.
 * Internally: createBootstrapConfiguration('config', z.object({ ... }))
 */
interface BootstrapOptions {
    /** Base path for config files. Default: './config/config'. */
    configBase: string;
    /** Active profiles. Default: []. Loads {configBase}-{profile}.{ext}. */
    profiles: string[];
    /** Environment variables source. Default: process.env. */
    env: Record<string, string>;
    /** CLI arguments source. Default: process.argv. */
    argv: string[];
    /** Prefix for env var mapping. Default: ''. */
    envPrefix: string;
    /** Prefix for CLI arg mapping (without '--'). Default: ''. */
    argvPrefix: string;
}

declare const BootstrapOptions: Token<BootstrapOptions>;

// --- BootstrapConfigurationRegistry (internal) ---

/**
 * Internal singleton for bootstrap configs.
 *
 * @OnConstruct lifecycle:
 *   1. Read @OverrideConfiguration for bootstrap tokens (Metadata.entries(OverrideConfiguration))
 *   2. Merge env vars (using Metadata.entries(BootstrapConfiguration) for field mapping)
 *   3. Merge cli args
 *   No config files. No variable substitution.
 *
 * registry.parse(token):
 *   Reads prefix/parser from Metadata.of(BootstrapConfiguration, token).
 *   Validates with parser.
 */
declare class BootstrapConfigurationRegistry {
    parse<T>(token: Token<T>): T;
}

// --- Regular configuration ---

interface ConfigurationMetadata<T> {
    prefix: string;
    parser: ConfigParser<T>;
}

/** Marks a token as a regular config schema (resolved from all sources). */
declare function Configuration<T>(prefix: string, parser: ConfigParser<T>): ClassDecorator<ConfigurationMetadata<T>>;

/**
 * Creates a config token bound to a prefix.
 * Token is decorated with @Configuration.
 * Factory: (registry = inject(ConfigurationRegistry)) => registry.parse(token)
 *
 * Precedence: @Provide (escape hatch) > cli > env > config file > @OverrideConfiguration > parser defaults
 *
 * Variable substitution: ${key} resolved from env context
 * (process.env + imported external sources). ${key:-default} for fallback.
 */
declare function createConfiguration<T>(prefix: string, parser: ConfigParser<T>): Token<T>;

// --- OverrideConfiguration ---

interface OverrideConfigurationMetadata<T> {
    token: Token<T>;
    override: (prev: Partial<T> | undefined) => Partial<T> | undefined;
}

/**
 * Code-level defaults for any config token (bootstrap or regular).
 * Lower priority than env/cli (and config files for regular configs).
 * The callback receives the previous override value (or undefined if first)
 * and returns the merged partial. Multiple @OverrideConfiguration for the
 * same token: chained in @Use order.
 */
declare function OverrideConfiguration<T>(
    configToken: Token<T>,
    override: (prev: Partial<T> | undefined) => Partial<T> | undefined,
): ClassDecorator<OverrideConfigurationMetadata<T>>;

// --- ConfigurationRegistry (internal) ---

/**
 * Internal singleton for regular configs. Depends on BootstrapConfigurationRegistry
 * (for BootstrapOptions) and Loaders/Resolvers.
 *
 * @OnConstruct lifecycle (in order):
 *   1. Read @OverrideConfiguration code defaults (Metadata.entries(OverrideConfiguration))
 *   2. Load config files:
 *      - Extensions from injectAll(Loader)
 *      - Try {configBase}.{ext}, first found wins
 *      - Per profile: {configBase}-{profile}.{ext}, merge on top
 *   3. Merge config files over code defaults
 *   4. Merge env vars (Metadata.entries(Configuration) for field mapping)
 *   5. Merge cli args
 *   6. Build env context: start with BootstrapOptions.env (process.env)
 *   7. Read kavri.config.import from merged config
 *   8. Load imports via injectMap(Resolver), merge into env context
 *   9. Resolve ${...} variables using env context
 *
 * registry.parse(token):
 *   Reads prefix/parser from Metadata.of(Configuration, token).
 *   Extracts node at prefix. Validates with parser.
 */
declare class ConfigurationRegistry {
    parse<T>(configToken: Token<T>): T;
}

// ============================================================
// Section 12: Error Types
// ============================================================

declare class CircularDependencyError extends Error {
    readonly chain: Injectable<any>[];
}

declare class MissingProviderError extends Error {
    readonly injectable: Injectable<any>;
}

declare class InjectContextError extends Error {}

declare class ScopeError extends Error {
    readonly injectable: Injectable<any>;
}

declare class DestroyedContainerError extends Error {}

declare class ConfigValidationError extends Error {
    readonly prefix: string;
    readonly issues: unknown;
}

declare class DuplicateProviderError extends Error {
    readonly injectable: Injectable<any>;
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

interface ControllerMetadata { path: string; }

function Controller(path: string, options?: ComponentOptions): ClassDecorator<ControllerMetadata> {
    return createClassDecorator<ControllerMetadata>(Controller, {path}, [Component(options)])
}

interface RateLimitMetadata { maxRequests: number; windowMs: number; }

function RateLimit(opts: RateLimitMetadata): MethodDecorator<RateLimitMetadata> {
    return createMethodDecorator<RateLimitMetadata>(RateLimit, opts);
}

// Metadata.entries(Controller) → [[UserController, { path: '/users' }], ...]
// Metadata.entries(RateLimit)  → [[ApiService, 'search', { maxRequests: 100, ... }], ...]


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

const DatabaseConfig = createConfiguration<{
    driver: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}>('database', z.object({
    driver: z.string(),
    host: z.string(),
    port: z.coerce.number().default(5432),
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
// Example 4: Config-driven Selection
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

const SelectedDriver = token<Driver<any>>(
    (config = inject(DatabaseConfig), driver = inject(Driver, config.driver)) => driver
);

const Connection = token<any>(
    (driver = inject(SelectedDriver)) => driver.connect(),
);


// ============================================================
// Example 5: @Provide and primary
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

const RedisConfig = createConfiguration<{ url: string }>('redis', z.object({
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


// ============================================================
// Example 6: Circular References
// ============================================================

@Component()
class OrderService {
    constructor(private readonly inventoryRef: Ref<InventoryService> = injectRef(InventoryService)) {}
}

@Component()
class InventoryService {
    constructor(private readonly orderRef: Ref<OrderService> = injectRef(OrderService)) {}
    async checkStock(productId: string, qty: number): Promise<boolean> { return true; }
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
// Example 8: Lifecycle Hooks (inject points)
// ============================================================

@Component()
class ConnectionPool {
    private pool: any;

    // @OnConstruct is an inject point — default params can use inject()
    @OnConstruct()
    async init(logger = inject(Logger)) {
        this.pool = {};
        logger.info('pool initialized');
    }

    @OnDestroy()
    async drain(logger = inject(Logger)) {
        logger.info('pool drained');
    }
}


// ============================================================
// Example 9: Conditional Components
// ============================================================

const TelemetryConfig = createConfiguration<{
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
}


// ============================================================
// Example 11: Configuration & @OverrideConfiguration
// ============================================================

// config/config.yaml (base config, loaded automatically):
// ---
// kavri:
//   config:
//     import:
//       - "aws-secretmanager:prod/db-secrets?prefix=database"
// app:
//   name: pet-store
//   env: "${APP_ENV:-dev}"
// database:
//   host: "${DATABASE_HOST:-localhost}"
//   password: "${database.password}"   # injected from AWS via import
//   url: "postgres://${database.host}:${database.port}"
//
// config/config-staging.yaml (profile override):
// ---
// app:
//   env: staging

const AppConfig = createConfiguration<{
    name: string;
    env: string;
    debug: boolean;
}>('app', z.object({
    name: z.string().default('kavri-app'),
    env: z.enum(['dev', 'staging', 'prod']).default('dev'),
    debug: z.boolean().default(false),
}));

// @OverrideConfiguration: code-level defaults (lower than file/env/cli)
@Component()
@OverrideConfiguration(BootstrapOptions, () => ({
    configBase: './config/config',
    profiles: ['staging'],
    envPrefix: 'MYAPP_',
}))
@OverrideConfiguration(DatabaseConfig, () => ({
    port: 5432,
    host: 'localhost',
}))
class AppConfigModule {}


// ============================================================
// Example 12: Import Resolvers (external secret sources)
// ============================================================

// Resolvers load external key-value pairs into the env context.
// Triggered by kavri.config.import entries in config files.
// Format: "{resolver-name}:{resource}" e.g. "aws-secretmanager:prod/db-secrets?prefix=database"

declare class SecretsManagerClient {
    constructor(options: { region: string });
    getSecretValue(params: { SecretId: string }): Promise<{ SecretString?: string }>;
}

// AwsSecretManagerResolver options — bootstrap (resolved from env/cli before config)
const AwsResolverOptions = createBootstrapConfiguration<{
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}>('aws', z.object({
    region: z.string().default('us-east-1'),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
}));

// Name MUST match the protocol in kavri.config.import
@Component({name: 'aws-secretmanager'})
class AwsSecretManagerResolver extends Resolver {
    private readonly client: SecretsManagerClient;

    constructor(opts = inject(AwsResolverOptions)) {
        super();
        this.client = new SecretsManagerClient(opts);
    }

    async load(resource: string) {
        // resource: "prod/db-secrets?prefix=database"
        // parse secretId and prefix from resource
        const [secretId, params] = resource.split('?');
        const prefix = new URLSearchParams(params).get('prefix') ?? '';
        const result = await this.client.getSecretValue({SecretId: secretId});
        const secrets = JSON.parse(result.SecretString ?? '{}');
        // return as prefixed keys: { "database.password": "xxx", "database.username": "yyy" }
        const entries: Record<string, string> = {};
        for (const [k, v] of Object.entries(secrets)) {
            entries[prefix ? `${prefix}.${k}` : k] = String(v);
        }
        return entries;
    }
}

@Component()
class EnvFileLoader extends Loader {
    supports() { return ['.env']; }
    load(content: string) { return {} as any; }
}


// ============================================================
// Example 13: Module System
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
@Use(AppConfigModule, CacheModule, DatabaseModule)
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
// Example 14: Testing
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
        constructor(readonly service = inject(UserService)) {}
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


// ============================================================
// Example 15: Full Application
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

const PetStoreConfig = createConfiguration<{
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
@Touch(AwsSecretManagerResolver, EnvFileLoader)
@Use(RedisModule)
@Use(RedisEventSubscriber, JobMetricsListener)
@OverrideConfiguration(BootstrapOptions, () => ({
    configBase: './config/config',
    profiles: ['prod'],
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

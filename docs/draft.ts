export {}

// ============================================================
// Section 1: Core Types
// ============================================================

type Qualifier = string | symbol;
type Awaitable<T> = T | Promise<T>;
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

export type AnyConstructor<T> = abstract new (...args: any[]) => T;

type NoArgsMethodKeyof<T> = T extends object
    ? { [P in keyof T]-?: T[P] extends () => any ? P : never; }[keyof T]
    : never;

type DecoratorStatic<T> = {
    readonly metadata: T | undefined;
}

export type ClassDecorator<T> =
    globalThis.ClassDecorator
    & ((target: Function, context: ClassDecoratorContext) => void)
    & DecoratorStatic<T>;

type MethodDecorator<T> =
    globalThis.MethodDecorator
    & ((target: Function, context: ClassMethodDecoratorContext) => void)
    & DecoratorStatic<T>;

export type FieldDecorator<T> =
    globalThis.MethodDecorator
    & ((value: any, context: ClassFieldDecoratorContext) => void)
    & DecoratorStatic<T>;

type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>
type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>
export type FieldDecoratorFactory<T> = (...args: any[]) => FieldDecorator<T>

export declare function createClassDecorator<T>(factory: ClassDecoratorFactory<T>, metadata: T, extra?: ClassDecorator<any>[]): ClassDecorator<T>;

declare function createMethodDecorator<T>(factory: MethodDecoratorFactory<T>, metadata: T, extra?: MethodDecorator<any>[]): MethodDecorator<T>;

export declare function createFieldDecorator<T>(factory: FieldDecoratorFactory<T>, metadata: T, extra?: FieldDecorator<any>[]): FieldDecorator<T>;

// ============================================================
// Section 2: Component Decorator
// ============================================================

interface ComponentMetadata {
    name?: Qualifier;
}

/** Marks a class as a container-managed component. All components are singletons. */
declare function Component(name?: Qualifier): ClassDecorator<ComponentMetadata>;

// ============================================================
// Section 3: Conditional Decorator
// ============================================================

interface ConditionalMetadata {
    predicate: () => Awaitable<boolean>;
}

/**
 * Marks a component as conditionally enabled.
 * Predicate is evaluated lazily on first inject(). Result is cached.
 * Runs in an inject context — default params can use inject()/injectConfig().
 *
 * CONSTRAINT: @Conditional and @OverrideConfiguration CANNOT coexist on the same class.
 * Enforced at runtime (throws) and by @kavri/eslint-plugin.
 * Reason: configuration must resolve before conditions are evaluated.
 *
 * Components with @OverrideConfiguration must NOT have @Conditional.
 * Resolver subclasses must NOT have @Conditional.
 */
declare function Conditional(predicate: () => Awaitable<boolean>): ClassDecorator<ConditionalMetadata>;

// ============================================================
// Section 4: Lifecycle Decorators
// ============================================================

/**
 * Called after construction. May be async. Inject point — default params can use inject().
 * Multiple @OnConstruct on one class: called in declaration order, serially.
 * Return value is ignored.
 */
declare function OnConstruct(): MethodDecorator<{}>;

/**
 * Called during container destroy, in reverse dependency order.
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

interface ProvideOptions<T> {
    name?: Qualifier;
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
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
 * (not disabled by @Conditional).
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
 *   4. @Conditional predicate parameters
 *   5. @OnConstruct / @OnDestroy method parameters
 *   6. onConstruct / onDestroy callback parameters (ProvideOptions)
 *   7. injectConfig() — also an inject point for @Configuration classes
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
// Section 9: Container
// ============================================================

/**
 * The root IoC container. All components are singletons.
 *
 * Resolution order for container.resolve(target):
 *   All @Use deps and target are entrypoints, instantiated serially.
 *   For each target:
 *     1. Check @Conditional. Disabled → skip. (Configuration resolves before conditions.)
 *     2. Register decorator metadata: @Touch, @Provide (pure registration).
 *        Duplicate @Provide → DuplicateProviderError (unless primary).
 *     3. Process @Use: recursively instantiate deps (depth-first).
 *     4. Call factory (inject context active).
 *     5. Call @OnConstruct methods (declaration order, serially, inject point).
 *     6. Mark instantiated.
 */
declare class Container {
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

// --- Loader ---

/**
 * Abstract file loader. Subclasses must be @Component().
 * Config module touches JsonLoader, YamlLoader, TomlLoader by default.
 */
abstract class Loader {
    abstract supports(): string[];

    abstract load(content: string): Awaitable<object>;
}

declare class JsonLoader extends Loader {
}

declare class YamlLoader extends Loader {
}

declare class TomlLoader extends Loader {
}

// --- Resolver ---

/**
 * Abstract variable resolver. Each resolver provides its own options class
 * via getOptionsClass(). The registry binds the options and passes them to resolve().
 * If the options class yields no values, resolve() is not invoked.
 *
 * Subclasses must be @Component(). Must NOT have @Conditional.
 * Must NOT use injectConfig() — use getOptionsClass() instead.
 * Discovered via injectAll(Resolver).
 */
abstract class Resolver<T = any> {
    abstract getOptionsClass(): AnyConstructor<T>;

    abstract resolve(options: T): Awaitable<Record<string, string>>;
}

// --- @Configuration ---

interface ConfigurationOptions {
    /** Hide from help output and/or schema generation. */
    hidden?: boolean | 'schema';
}

interface ConfigurationMetadata {
    prefix: string;
    options: ConfigurationOptions;
}

/**
 * Marks a class as a configuration schema.
 * Composes @Schema() — all fields must have field decorators from @kavri/schema.
 *
 * @example
 * @Configuration('app')
 * class AppConfig {
 *     @IsString({ default: 'my-app' }) name!: string;
 *     @IsInteger({ default: 3000 }) port!: number;
 * }
 */
declare function Configuration(prefix: string, options?: ConfigurationOptions): ClassDecorator<ConfigurationMetadata>;

// --- Built-in configuration classes ---

/** Not modifiable via env/cli/file. Hidden from help and schema. */
@Configuration('kavri.config', {hidden: true})
class EnvOptions {
    env: Record<string, string> = process.env;
    argv: string[] = process.argv.slice(2);
}

/** Config file path. Hidden from schema only. Modifiable via env/cli. */
@Configuration('kavri.config', {hidden: 'schema')
class ConfigFileOptions {
    @IsString({default: './config/config')
    configFile!: string;
}

/** Active profiles. */
@Configuration('kavri.config')
class ProfileOptions {
    @IsArray(IsString(), {default: []})
    profiles!: string[];
}

/** Variant options controlling env/cli mapping, variables, and strictness. */
@Configuration('kavri.config')
class VariantOptions {
    @IsString({default: '') envPrefix!: string;
    @IsString({default: '') argvPrefix!: string;
    @IsRecord(IsString(), {default: {}}) variables!: Record<string, string>;
    @IsBoolean({default: false}) allowUnused!: boolean;
}

// --- injectConfig ---

/**
 * Injects a validated @Configuration class instance.
 * This is an inject point — usable in constructors, factories, @Conditional, etc.
 * Internally calls ConfigurationRegistry.bind(clazz).
 *
 * Precedence: cli > env > config file > @OverrideConfiguration > schema defaults
 * Variable substitution occurs during bind().
 */
declare function injectConfig<T>(clazz: AnyConstructor<T>): T;
declare function injectConfig<T>(clazz: AnyConstructor<T>, optional: true): T | undefined;

// --- @OverrideConfiguration ---

interface OverrideConfigurationMetadata<T> {
    clazz: AnyConstructor<T>;
    override: (prev: Partial<T> | undefined) => Partial<T> | undefined;
}

/**
 * Code-level defaults for a @Configuration class.
 * Lowest priority layer — overridden by config files, env, and cli.
 *
 * CONSTRAINT: Classes with @OverrideConfiguration must NOT have @Conditional.
 */
declare function OverrideConfiguration<T>(
    clazz: AnyConstructor<T>,
    override: (prev: Partial<T> | undefined) => Partial<T> | undefined,
): ClassDecorator<OverrideConfigurationMetadata<T>>;

// --- ConfigurationRegistry (internal) ---

/**
 * Internal singleton. Manages layered config data.
 *
 * @OnConstruct lifecycle (Spring-style layered resolution):
 *   1. pushCodeOverrides()    — @OverrideConfiguration values (lowest priority)
 *   2. bind(EnvOptions)       — get env/argv sources
 *   3. unshiftEnv(env)        — push env layer (higher than code, lower than cli)
 *   4. unshiftArgv(argv)      — push cli layer (highest priority)
 *   5. mergeEnvVariables(env) — env vars also serve as variables for ${...}
 *   6. bind(ConfigFileOptions) — determine config file path (cli/env can override)
 *   7. parseRootFile()        — load & parse config file, insert after cli/env layers
 *   8. bind(ProfileOptions)   — determine active profiles (root file can specify)
 *   9. parseProfileFiles()    — load profile files, insert before root file
 *  10. bind(VariantOptions)   — parse variant settings (envPrefix, argvPrefix, variables, allowUnused)
 *  11. invokeResolvers()      — for each Resolver (injectAll(Resolver)):
 *          bind resolver's getOptionsClass() → if has values, call resolve(options)
 *          → merge returned variables
 *  12. validate()             — check allowUnused constraint
 *
 * bind<T>(configClass):
 *   Parse config class from current layered state.
 *   Cached: each class is bound exactly once.
 *   Variable substitution (${key} / ${key:-default}) performed during bind
 *   using accumulated variables (env + resolver-provided).
 */
declare class ConfigurationRegistry {
    bind<T>(clazz: AnyConstructor<T>): T;
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

declare class InjectContextError extends Error {
}

declare class DestroyedContainerError extends Error {
}

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

interface ScheduledMetadata {
    cron: string;
}

function Scheduled(cron: string): ClassDecorator<ScheduledMetadata> {
    return createClassDecorator<ScheduledMetadata>(Scheduled, {cron}, [Component()])
}

interface RateLimitMetadata {
    maxRequests: number;
    windowMs: number;
}

function RateLimit(opts: RateLimitMetadata): MethodDecorator<RateLimitMetadata> {
    return createMethodDecorator<RateLimitMetadata>(RateLimit, opts);
}

// Metadata.entries(Scheduled) → [[HourlyCleanup, { cron: '0 * * * *' }], ...]
// Metadata.entries(RateLimit)  → [[ApiService, 'search', { maxRequests: 100, ... }], ...]


// ============================================================
// Example 1: Basic Components and Injection
// ============================================================

@Component()
class Logger {
    info(message: string): void {
    }

    error(message: string, err?: Error): void {
    }
}

@Component()
class UserRepository {
    findById(id: string): Promise<any> {
        return Promise.resolve();
    }

    findAll(): Promise<any[]> {
        return Promise.resolve([]);
    }

    save(user: any): Promise<void> {
        return Promise.resolve();
    }
}

@Component()
class UserService {
    constructor(
        private readonly logger = inject(Logger),
        private readonly repo = inject(UserRepository),
    ) {
    }

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

@Component('json')
class JsonSerializer extends Serializer {
    contentType() {
        return 'application/json';
    }

    serialize(data: any) {
        return JSON.stringify(data);
    }

    deserialize(raw: string) {
        return JSON.parse(raw);
    }
}

@Component('xml')
class XmlSerializer extends Serializer {
    contentType() {
        return 'text/xml';
    }

    serialize(data: any) {
        return '<data/>';
    }

    deserialize(raw: string) {
        return {};
    }
}

@Component('yaml')
class YamlSerializer extends Serializer {
    contentType() {
        return 'text/yaml';
    }

    serialize(data: any) {
        return '';
    }

    deserialize(raw: string) {
        return {};
    }
}

@Component()
class DataExporter {
    constructor(
        private readonly json = inject(Serializer, 'json'),
        private readonly allSerializers = injectAll(Serializer, 'alphabetical'),
        private readonly serializerMap = injectMap(Serializer),
        private readonly serializerSet = injectSet(Serializer),
    ) {
    }

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

@Configuration('database')
class DatabaseConfig {
    @IsString() driver!: string;
    @IsString() host!: string;
    @IsInteger({default: 5432}) port!: number;
    @IsString() username!: string;
    @IsString() password!: string;
    @IsString() database!: string;
}

const DatabaseUrl = token<string>(
    (config = injectConfig(DatabaseConfig)) => `${config.driver}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`
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

@Component('mysql')
class MysqlDriver extends Driver<unknown> {
    connect() {
        return Promise.resolve(undefined);
    }

    execute<T>(conn: unknown, sql: string, values: any[]) {
        return Promise.resolve<T[]>([]);
    }

    close(conn: unknown) {
        return Promise.resolve();
    }
}

@Component('psql')
class PsqlDriver extends Driver<unknown> {
    connect() {
        return Promise.resolve(undefined);
    }

    execute<T>(conn: unknown, sql: string, values: any[]) {
        return Promise.resolve<T[]>([]);
    }

    close(conn: unknown) {
        return Promise.resolve();
    }
}

const SelectedDriver = token<Driver<any>>(
    (config = injectConfig(DatabaseConfig), driver = inject(Driver, config.driver)) => driver
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

@Configuration('redis')
class RedisConfig {
    @IsString() url!: string;
}

@Component()
@Provide(Sequelize, async (url = inject(DatabaseUrl)) => {
    const seq = new Sequelize(url, {logging: false});
    await seq.authenticate();
    return seq;
}, {onDestroy: 'close')
@Provide(Redis, async (config = injectConfig(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, {onDestroy: 'disconnect')
class InfraModule {
}


// ============================================================
// Example 6: Circular References
// ============================================================

@Component()
class OrderService {
    constructor(private readonly inventoryRef: Ref<InventoryService> = injectRef(InventoryService)) {
    }
}

@Component()
class InventoryService {
    constructor(private readonly orderRef: Ref<OrderService> = injectRef(OrderService)) {
    }

    async checkStock(productId: string, qty: number): Promise<boolean> {
        return true;
    }
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

@Configuration('telemetry')
class TelemetryConfig {
    @IsBoolean({default: false}) enabled!: boolean;
    @IsString({optional: true}) endpoint?: string;
}

@Component()
@Conditional((config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false)
class TelemetryService {
    constructor(private readonly config = injectConfig(TelemetryConfig)) {
    }

    send(metric: string, value: number): void {
    }
}

@Component()
class AppService {
    constructor(private readonly telemetry = inject(TelemetryService, true)) {
    }

    doWork() {
        this.telemetry?.send('work.done', 1);
    }
}


// ============================================================
// Example 10: Event System
// ============================================================

@EventType('job.started')
class JobStartedEvent {
    constructor(public readonly jobId: string, public readonly startedAt: number = Date.now()) {
    }
}

@EventType('job.completed')
class JobCompletedEvent {
    constructor(public readonly jobId: string, public readonly result: any) {
    }
}

@EventType('job.failed')
class JobFailedEvent {
    constructor(public readonly jobId: string, public readonly error: Error) {
    }
}

const CacheInvalidated = defineEvent<{ key: string; reason: string }>('cache.invalidated');
const SystemShutdown = defineEvent<{ timeout: number }>('system.shutdown');

@Component()
class JobMetricsListener {
    constructor(private readonly telemetry = inject(TelemetryService, true)) {
    }

    @OnEvent(JobStartedEvent)
    onJobStarted(ev: JobStartedEvent) {
        this.telemetry?.send('job.started', 1);
    }

    @OnEvent(JobCompletedEvent)
    onJobCompleted(ev: JobCompletedEvent) {
        this.telemetry?.send('job.completed', 1);
    }

    @OnEvent(JobFailedEvent)
    onJobFailed(ev: JobFailedEvent) {
        this.telemetry?.send('job.failed', 1);
    }
}

@Component()
class CacheManager {
    private readonly cache = new Map<string, any>();

    @OnEvent(CacheInvalidated)
    onCacheInvalidated(data: { key: string; reason: string }) {
        this.cache.delete(data.key);
    }

    @OnEvent(SystemShutdown)
    onShutdown(data: { timeout: number }) {
        this.cache.clear();
    }
}

@Component()
class JobRunner {
    constructor(private readonly events = inject(EventBus)) {
    }

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

@Configuration('app')
class AppConfig {
    @IsString({default: 'kavri-app') name!: string;
    @IsString({in: ['dev', 'staging', 'prod'], default: 'dev') env!: string;
    @IsBoolean({default: false}) debug!: boolean;
}

// @OverrideConfiguration: code-level defaults (lower than file/env/cli)
@Component()
@OverrideConfiguration(ConfigFileOptions, () => ({configFile: './config/app'}))
@OverrideConfiguration(ProfileOptions, () => ({profiles: ['staging']}))
@OverrideConfiguration(VariantOptions, () => ({envPrefix: 'MYAPP_'}))
@OverrideConfiguration(DatabaseConfig, () => ({
    port: 5432,
    host: 'localhost',
}))
class AppConfigModule {
}


// ============================================================
// Example 12: Import Resolvers (external secret sources)
// ============================================================

// Resolvers load external key-value pairs into the env context.
// Each resolver manages its own strategy via getOptionsClass()/resolve().

declare class SecretsManagerClient {
    constructor(options: { region: string });

    getSecretValue(params: { SecretId: string }): Promise<{ SecretString?: string }>;
}

// AwsSecretManagerResolver options — bound early during registry init
@Configuration('kavri.resolver.aws.secretmanager')
class AwsSecretManagerResolverOptions {
    @IsString() region!: string;
    @IsString({optional: true}) keyId?: string;
    @IsString({optional: true}) secretKey?: string;
    @IsString({optional: true}) roleId?: string;
    @IsArray(IsObject({name: IsString(), prefix: IsString()}))
    items!: Array<{ name: string; prefix: string }>;
}

// Resolver uses getOptionsClass() — no injectConfig() allowed.
// If AwsSecretManagerResolverOptions yields no values, resolve() is not called.
@Component()
class AwsSecretManagerResolver extends Resolver<AwsSecretManagerResolverOptions> {
    getOptionsClass() {
        return AwsSecretManagerResolverOptions;
    }

    async resolve(opts: AwsSecretManagerResolverOptions) {
        const client = new SecretsManagerClient(opts);
        const entries: Record<string, string> = {};
        for (const item of opts.items) {
            const result = await client.getSecretValue({SecretId: item.name});
            const secrets = JSON.parse(result.SecretString ?? '{}');
            for (const [k, v] of Object.entries(secrets)) {
                entries[item.prefix ? `${item.prefix}.${k}` : k] = String(v);
            }
        }
        return entries;
    }
}

@Component()
class EnvFileLoader extends Loader {
    supports() {
        return ['.env'];
    }

    load(content: string) {
        return {} as any;
    }
}


// ============================================================
// Example 13: Module System
// ============================================================

@Component()
@Provide(Redis, async (config = injectConfig(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, {onDestroy: 'disconnect')
class CacheModule {
}

@Component()
@Touch(MysqlDriver, PsqlDriver)
@Provide(Sequelize, async (url = inject(DatabaseUrl)) => {
    const seq = new Sequelize(url);
    await seq.authenticate();
    return seq;
}, {onDestroy: 'close')
class DatabaseModule {
}

@Component()
class RedisEventSubscriber {
    private readonly unsub: () => void;

    constructor(
        private readonly redis = inject(Redis),
        private readonly events = inject(EventBus),
    ) {
        this.unsub = () => {
        };
    }

    @OnDestroy()
    dispose() {
        this.unsub();
    }
}

@Component()
@Touch(JsonSerializer, XmlSerializer, YamlSerializer)
@Use(AppConfigModule, CacheModule, DatabaseModule)
@Use(RedisEventSubscriber, JobMetricsListener)
class Application {
    constructor(
        private readonly appConfig = injectConfig(AppConfig),
        private readonly serializers = injectAll(Serializer, 'alphabetical'),
        private readonly jobs = inject(JobRunner),
        private readonly events = inject(EventBus),
    ) {
    }

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
    @Provide(Logger, () => ({
        info() {
        }, error() {
        }
    }))
    @Provide(UserRepository, () => ({
        findById: async (id: string) => ({id, name: 'Test User'),
        findAll: async () => [{id: '1', name: 'Test User'}],
        save: async () => {
        },
    }))
    @Use(UserService)
    class TestHarness {
        constructor(readonly service = inject(UserService)) {
        }
    }

    const container = new Container();
    const harness = await container.resolve(TestHarness);
    const user = await harness.service.getUser('1');
    console.assert(user.name === 'Test User');
    await container.destroy();
}

    async function testConditionalComponent() {
        @Component()
        @Provide(TelemetryConfig, () => ({enabled: true, endpoint: 'http://localhost:9090'}))
        class TestHarness {
            constructor(readonly telemetry = inject(TelemetryService)) {
            }
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

    @Component('dog')
    class Dog extends Pet {
        speech() {
            return 'woof';
        }
    }

    @Component('cat')
    class Cat extends Pet {
        speech() {
            return 'meow';
        }
    }

    @Component('bird')
    class Bird extends Pet {
        speech() {
            return 'tweet';
        }
    }

    @Component()
    abstract class Repository<T> {
        constructor(
            private readonly conn = inject(Connection),
            private readonly driver = inject(SelectedDriver),
        ) {
        }

        abstract tableName(): string;

        findOne(id: string): Promise<T | undefined> {
            return Promise.resolve(undefined);
        }

        findAll(): Promise<readonly T[]> {
            return Promise.resolve([]);
        }

        create(input: T): Promise<T> {
            return Promise.resolve(input);
        }

        delete(id: string): Promise<void> {
            return Promise.resolve();
        }
    }

    interface PetRecord {
        id: string;
        name: string;
        species: string;
        greeting: string;
    }

    @Component()
    class PetRepository extends Repository<PetRecord> {
        tableName() {
            return 'pets';
        }
    }

    const RedisUrl = token<string>((config = injectConfig(RedisConfig)) => config.url);

    @EventType('pet.adopted')
    class PetAdoptedEvent {
        constructor(public readonly petId: string, public readonly species: string) {
        }
    }

    @Configuration('petstore')
    class PetStoreConfig {
        @IsString({default: 'dog') defaultPet!: string;
        @IsInteger({default: 5}) maxPetsPerUser!: number;
    }

    @Component()
    @Provide(Redis, async (url = inject(RedisUrl)) => {
        const redis = new Redis();
        await redis.connect(url);
        return redis;
    }, {onDestroy: 'disconnect')
    class RedisModule {
    }

    @Component()
    @Touch(Dog, Cat, Bird)
    @Touch(PsqlDriver)
    @Touch(AwsSecretManagerResolver, EnvFileLoader)
    @Use(RedisModule)
    @Use(RedisEventSubscriber, JobMetricsListener)
    @OverrideConfiguration(ConfigFileOptions, () => ({configFile: './config/petstore'}))
    @OverrideConfiguration(ProfileOptions, () => ({profiles: ['prod']}))
    @OverrideConfiguration(VariantOptions, () => ({envPrefix: 'PETSTORE_'}))
    class PetStoreApplication {
        constructor(
            private readonly config = injectConfig(PetStoreConfig),
            private readonly appConfig = injectConfig(AppConfig),
            private readonly petRepo = inject(PetRepository),
            private readonly allPets = injectAll(Pet, 'alphabetical'),
            private readonly defaultPet = inject(Pet, config.defaultPet),
            private readonly events = inject(EventBus),
            private readonly telemetry = inject(TelemetryService, true),
        ) {
        }

        @OnConstruct()
        async init() {
        }

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

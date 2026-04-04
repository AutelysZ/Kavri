export {}

// ============================================================
// Section 1: Core Types
// ============================================================

/** Qualifier for named bindings — string or symbol. */
type Qualifier = string | symbol;

/**
 * Provider scope determines instance lifetime:
 * - 'singleton': one instance per container (default)
 * - 'scoped': one instance per child scope (e.g., per HTTP request)
 * - 'transient': new instance per injection point
 */
type ProviderScope = 'singleton' | 'scoped' | 'transient';

type Awaitable<T> = T | Promise<T>;

/**
 * Hybrid class decorator: works with both TypeScript experimental decorators
 * and TC39 Stage 3 decorators. No reflect-metadata dependency.
 */
type ClassDecorator = globalThis.ClassDecorator & ((target: Function, context: ClassDecoratorContext) => void);

/** Hybrid method decorator for both decorator styles. */
type MethodDecorator = globalThis.MethodDecorator & ((target: Function, context: ClassMethodDecoratorContext) => void);

/** Constructor accepting any arguments — used for external/third-party classes. */
type AnyConstructor<T> = abstract new (...args: any[]) => T;

/** Constructor accepting no arguments — managed classes use default params for injection. */
type Constructor<T> = abstract new () => T;

/** Extracts keys of methods that accept no arguments. */
type NoArgsMethodKeyof<T> = { [P in keyof T]-?: T[P] extends () => any ? P : never; }[keyof T]

/** Ordering strategy for collection injection. */
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

// ============================================================
// Section 2: Component Decorator
// ============================================================

interface ComponentOptions {
    /** Named binding qualifier. Required for inject(Base, name) resolution. */
    name?: Qualifier;

    /** Instance scope. Defaults to 'singleton'. */
    scope?: ProviderScope;

    /**
     * Async condition evaluated during container initialization.
     * If it returns false, the component is excluded.
     * Runs in an inject context — can use inject()/injectConfig() in default params.
     *
     * @example
     * condition: (config = injectConfig(FeatureFlags)) => config.metricsEnabled
     */
    condition?: () => Awaitable<boolean>;
}

/**
 * Marks a class as a container-managed component.
 *
 * - Subclasses of an abstract base are automatically part of that base's collection.
 * - Constructor parameters use default values with inject() for dependency injection.
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
declare function Component(options?: ComponentOptions): ClassDecorator;

// ============================================================
// Section 3: Lifecycle Decorators
// ============================================================

/**
 * Called after the instance is constructed and all synchronous dependencies are injected.
 * May be async — the container waits for completion before making the instance available.
 * Use for async initialization: opening connections, warming caches, etc.
 */
declare function OnConstruct(): MethodDecorator;

/**
 * Called after the container has fully initialized all `use()`-ed and imported
 * components. The entire dependency graph is ready at this point.
 * Use for cross-component coordination that requires a fully wired system.
 */
declare function OnApplicationReady(): MethodDecorator;

/**
 * Called during container/scope destroy, in reverse dependency order.
 * Use for cleanup: closing connections, flushing buffers, releasing resources.
 */
declare function OnDestroy(): MethodDecorator;

// ============================================================
// Section 4: Providers — Token
// ============================================================

/**
 * A typed token representing an injectable value.
 * Created via token(). Can be overridden via Container.provide().
 *
 * Tokens are used when:
 * - The injectable is not a class (primitives, interfaces, config values)
 * - The injectable is an external class whose constructor you don't control
 * - You want a named, typed reference to a value with a default factory
 */
declare class Token<T> {
    readonly factory: () => Awaitable<T>;
}

/**
 * Creates a typed token with a factory default.
 * The factory runs in an inject context — use inject()/injectConfig() in default params.
 *
 * @example
 * // simple value token
 * const AppName = token<string>(() => 'my-app');
 *
 * // token with dependencies
 * const DbUrl = token<string>((config = injectConfig(DatabaseConfig)) => config.url);
 *
 * // token for external class with lifecycle hook
 * const Redis = token<RedisClient>(
 *     (url = inject(RedisUrl)) => new RedisClient(url),
 *     { onDestroy: (client) => client.disconnect() }
 * );
 */
declare function token<T>(factory: () => Awaitable<T>, options?: ProvideOptions<T>): Token<T>;

// ============================================================
// Section 5: Providers — Computed
// ============================================================

/**
 * A computed injectable that resolves dynamically based on runtime conditions.
 * Use for config-driven provider selection, strategy patterns, etc.
 */
declare class Computed<T> {
    readonly resolve: () => Awaitable<T>;
}

/**
 * Creates a computed injectable. The resolver runs in an inject context.
 *
 * Computed is the primary mechanism for config-driven component selection:
 * read config → select a named component → return it.
 *
 * @example
 * const SelectedDriver = computed<Driver>(
 *     (config = injectConfig(DbConfig), driver = inject(Driver, config.driver)) => driver
 * );
 */
declare function computed<T>(resolve: () => Awaitable<T>): Computed<T>;

// ============================================================
// Section 6: Providers — @Provide (Method Provider)
// ============================================================

/**
 * Lifecycle hooks for providers.
 * Each hook can be either a no-arg method name on the instance or a callback.
 * Extends ComponentOptions so providers can have name, scope, and condition.
 */
interface ProvideOptions<T> extends ComponentOptions {
    /** Called after construction. */
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    /** Called after the container is fully ready. */
    onApplicationReady?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    /** Called during destroy, in reverse dependency order. */
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

/**
 * Decorates a method as a factory for an external class.
 * The method's return value becomes the injectable instance for that class.
 * The method runs in an inject context — use inject() in default params.
 *
 * Use @Provide when you need to instantiate a class you don't own (third-party libraries),
 * or when construction requires complex setup logic.
 *
 * @Provide can be used in any @Component() class — it is not limited to "module" classes.
 *
 * @example
 * @Component()
 * class DatabaseModule {
 *     @Provide(Sequelize, { onDestroy: 'close' })
 *     createSequelize(config = injectConfig(DbConfig)): Sequelize {
 *         return new Sequelize(config.url);
 *     }
 * }
 */
declare function Provide<T>(clazz: AnyConstructor<T>, options?: ProvideOptions<T>): MethodDecorator;

// ============================================================
// Section 7: Injectable Type & Injection APIs
// ============================================================

/**
 * Union of all injectable targets.
 * This is the universal type accepted by inject(), injectAll(), Container.resolve(), etc.
 */
type Injectable<T> = AnyConstructor<T> | Constructor<T> | Token<T> | Computed<T>;

/**
 * Lazy reference wrapper for circular or deferred dependencies.
 * The actual instance is resolved after the requesting component's construction completes.
 */
declare class Ref<T> {
    /** Returns the resolved instance. Throws if accessed during construction. */
    get(): T;
}

/**
 * Injects a dependency. MUST only be called in inject points via default parameters:
 *   1. Constructor parameters of @Component classes
 *   2. Token factory functions
 *   3. Computed resolve functions
 *   4. @Provide method parameters
 *   5. ComponentOptions.condition functions
 *
 * Async resolution: uses React Suspense-style interruption. If a dependency has an async
 * initializer (@OnConstruct) and is not yet ready, inject() throws a Promise to interrupt
 * the current factory. The container catches it, awaits the dependency, then re-invokes
 * the factory. This repeats until all dependencies are satisfied synchronously.
 *
 * Overloads:
 *   inject(target)              — required injection
 *   inject(target, name)        — named injection (selects by @Component({ name }))
 *   inject(target, true)        — optional injection (returns undefined if unavailable)
 *   inject(target, name, true)  — named + optional
 */
declare function inject<T>(injectable: Injectable<T>): T
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined

/**
 * Creates a lazy reference for circular dependencies or deferred resolution.
 * The callback returns the Injectable target — it's wrapped in a function to break
 * the circular reference at the module level.
 *
 * @example
 * @Component()
 * class ServiceA {
 *     constructor(private readonly b = injectRef(ServiceB)) {}
 *     useB() { this.b.get().doSomething(); }
 * }
 */
declare function injectRef<T>(injectable: Injectable<T>): Ref<T>
declare function injectRef<T>(injectable: Injectable<T>, optional: true): Ref<T> | undefined

/**
 * Injects all @Component-decorated subclasses/implementations of the target.
 * Only components that are imported/registered in the container are included.
 *
 * @param order — 'topological' (dependency order), 'provided' (registration order),
 *                'alphabetical' (by component name). Defaults to 'provided'.
 */
declare function injectAll<T>(injectable: Injectable<T>, order?: CollectionOrder): readonly T[]

/** Injects all implementations as a ReadonlySet. */
declare function injectSet<T>(injectable: Injectable<T>): ReadonlySet<T>;

/** Injects all implementations as a Map keyed by their Qualifier (component name). */
declare function injectMap<T>(injectable: Injectable<T>): ReadonlyMap<Qualifier, T>;

// ============================================================
// Section 8: Reflection
// ============================================================

/**
 * Returns the component metadata for an injectable or its instance.
 * Useful for introspection — e.g., reading the component name at runtime.
 *
 * @example
 * const meta = getComponentMetadata(myPet);
 * console.log(meta.name); // 'dog'
 */
declare function getComponentMetadata<T>(target: Injectable<T> | T): ProvideOptions<T>

// ============================================================
// Section 9: Module System — @Import & @Use
// ============================================================

/**
 * Class decorator: ensures the listed injectables are registered (imported)
 * when this class is resolved by the container.
 *
 * Use @Import to declare which implementations should be available.
 * This is especially important for collection injection (injectAll/injectMap/injectSet)
 * where each implementation must be explicitly imported.
 *
 * A module is simply a @Component() class with @Provide methods and/or @Import/@Use decorators.
 * No special @Module decorator is needed — any @Component can serve as a module.
 *
 * @example
 * @Component()
 * @Import(MysqlDriver, PsqlDriver)
 * class DatabaseModule {
 *     @Provide(DataSource, { onDestroy: 'close' })
 *     createDataSource(config = injectConfig(DbConfig)): DataSource { ... }
 * }
 */
declare function Import(...injectables: Injectable<any>[]): ClassDecorator;

/**
 * Class decorator: ensures the listed injectables are instantiated (and their
 * @Provide methods processed) before this class is resolved.
 *
 * Use @Use for:
 * - Components with @Provide methods that must be processed
 * - Side-effect components (event subscribers, metric collectors, scheduled tasks)
 * - Any component that must be alive before the decorated class runs
 *
 * @example
 * @Use(RedisModule, EventSubscriber, MetricsCollector)
 * class Application { ... }
 */
declare function Use(...injectables: Injectable<any>[]): ClassDecorator;

// ============================================================
// Section 10: Container & Scope
// ============================================================

/**
 * The root IoC container. Entry point for the application.
 *
 * Typical lifecycle:
 *   1. Create container
 *   2. Call provide()/import()/use() to configure
 *   3. Call resolve() to bootstrap the application
 *   4. Call destroy() for graceful shutdown
 */
declare class Container {
    /**
     * Override or register a provider for an injectable.
     * The factory runs in an inject context.
     *
     * Use cases:
     * - Override a token's default factory
     * - Provide an implementation for an external class
     * - Replace a component for testing
     *
     * @example
     * container.provide(ConfigOptions, (defaults = inject(ConfigOptions)) => ({
     *     ...defaults,
     *     configFiles: ['app.yaml'],
     * }));
     */
    provide<T>(target: Injectable<T>, factory: () => Awaitable<T>, options?: ProvideOptions<T>): void;

    /**
     * Ensure injectables are registered. No-op if already known.
     * Needed for making specific implementations available for collection injection.
     *
     * @example
     * container.import(PsqlDriver);          // only PsqlDriver available, not MysqlDriver
     * container.import(Dog, Cat);             // both available in injectAll(Pet)
     */
    import(...injectables: Injectable<any>[]): void;

    /**
     * Ensure injectables are instantiated (and their @Provide methods processed)
     * before any resolve() call.
     *
     * @example
     * container.use(DatabaseModule);          // process @Provide methods in DatabaseModule
     * container.use(RedisEventSubscriber);    // start the subscriber
     */
    use(...injectables: Injectable<any>[]): void;

    /**
     * Resolve an injectable. Returns a Promise that resolves after all async
     * initializers (@OnConstruct) in the dependency chain complete.
     * After resolution, @OnApplicationReady hooks fire for all initialized components.
     */
    resolve<T>(injectable: Injectable<T>): Promise<T>;

    /**
     * Create a child scope for scoped providers.
     * Scoped components get fresh instances within each scope.
     * Singleton components are shared from the parent container.
     * Transient components are always fresh regardless of scope.
     *
     * @example
     * const scope = container.createScope('http-request-123');
     * const handler = await scope.resolve(RequestHandler);
     * await handler.handle(request);
     * await scope.destroy();
     */
    createScope(name?: string): Scope;

    /**
     * Destroy the container. Calls @OnDestroy hooks in reverse dependency order.
     * After destroy, the container cannot resolve new instances.
     */
    destroy(): Promise<void>;
}

/**
 * A child scope created by Container.createScope().
 * Scoped providers are instantiated fresh within each scope.
 * Destroyed when scope.destroy() is called.
 */
declare class Scope {
    /** Resolve an injectable within this scope. */
    resolve<T>(injectable: Injectable<T>): Promise<T>;

    /** Destroy this scope. Calls @OnDestroy on scoped instances in reverse order. */
    destroy(): Promise<void>;
}

// ============================================================
// Section 11: Event System
// ============================================================

// Two ways to define events: class-based (with @EventData) or token-based (with event<T>()).

/**
 * Marks a class as event data with a string identifier.
 * Instances of this class can be dispatched via EventDispatcher.dispatch(instance).
 *
 * @example
 * @EventData('order.created')
 * class OrderCreatedEvent {
 *     constructor(public readonly orderId: string, public readonly total: number) {}
 * }
 */
declare function EventData(name: string): ClassDecorator;

/**
 * Marks a method as a listener for a specific event type.
 * The method is invoked when a matching event is dispatched.
 * Listeners are called in dependency order (components resolved first are called first).
 *
 * @example
 * @Component()
 * class OrderNotifier {
 *     @EventListener(OrderCreatedEvent)
 *     async onOrderCreated(event: OrderCreatedEvent) {
 *         await sendEmail(event.orderId);
 *     }
 *
 *     @EventListener(CacheInvalidated)
 *     onCacheInvalidated(data: { key: string }) {
 *         clearLocalCache(data.key);
 *     }
 * }
 */
declare function EventListener<T>(data: AnyConstructor<T> | Event<T>): MethodDecorator;

/**
 * A typed event channel for token-based events.
 * Use when you want lightweight pub/sub without defining a class.
 */
declare class Event<T> {
    readonly data: T;
}

/**
 * Creates a typed event channel.
 *
 * @example
 * const CacheInvalidated = event<{ key: string }>();
 * const ShutdownRequested = event<{ reason: string; timeout: number }>();
 */
declare function event<T>(): Event<T>;

/**
 * Built-in component for dispatching events.
 * Inject via inject(EventDispatcher).
 * All @EventListener methods for the matching event type are invoked.
 * Dispatch is async — it waits for all listeners to complete.
 */
declare class EventDispatcher {
    /** Dispatch a class-based event. The event class must be decorated with @EventData. */
    dispatch<T>(data: T): Promise<void>;
    /** Dispatch a token-based event with data. */
    dispatch<T>(event: Event<T>, data: T): Promise<void>;
}

// ============================================================
// Section 12: Configuration Module
// ============================================================

/**
 * Configuration source options.
 * Override via Container.provide(ConfigOptions, ...) to customize config loading.
 *
 * Source precedence (highest → lowest):
 *   1. Container.provide() runtime overrides
 *   2. CLI arguments (matched by argvPrefix)
 *   3. Environment variables (matched by envPrefix)
 *   4. Config files (yaml/json/toml, loaded in order — later files override)
 *   5. Schema defaults (@Configuration class defaults or zod .default())
 */
interface ConfigOptions {
    /** Config file paths. Supports yaml, json, toml. Loaded in order. */
    configFiles: string[];
    /** Environment variables to consider. Typically process.env. */
    env: Record<string, string>;
    /** CLI arguments. Typically process.argv. */
    argv: string[];
    /** Prefix for env var mapping. 'APP_' maps APP_DATABASE_HOST → database.host. */
    envPrefix: string;
    /** Prefix for CLI arg mapping. '--app.' maps --app.database.host → database.host. */
    argvPrefix: string;
}

/** Token for ConfigOptions. Override to customize config sources. */
declare const ConfigOptions: Token<ConfigOptions>;

// --- Class-based configuration (class-validator style) ---

/**
 * Marks a class as a typed configuration schema bound to a config key prefix.
 * Properties are populated from config sources and can be validated with
 * class-validator decorators.
 *
 * The prefix maps to a nested key path in config files:
 *   @Configuration("database") → reads from `database:` in YAML
 *   @Configuration("app.feature") → reads from `app.feature:` in YAML
 *
 * @example
 * @Configuration("database")
 * class DatabaseConfig {
 *     driver!: string;          // database.driver
 *     host!: string;            // database.host
 *     port!: number;            // database.port
 *     username!: string;        // database.username
 *     password!: string;        // database.password
 *     database!: string;        // database.database
 * }
 */
declare function Configuration(prefix: string): ClassDecorator;

// --- Zod-based configuration ---

/** Opaque Zod schema type. */
declare type ZodSchema<T> = unknown;

/**
 * A zod-based config schema bound to a prefix.
 * Created via createConfigSchema(). Used with injectConfig().
 */
declare class ConfigSchema<T> {
    readonly prefix: string;
    readonly schema: ZodSchema<T>;
}

/**
 * Creates a zod-based config schema.
 *
 * @example
 * const AppConfig = createConfigSchema('app', z.object({
 *     name: z.string().default('kavri-app'),
 *     env: z.enum(['dev', 'staging', 'prod']).default('dev'),
 *     debug: z.boolean().default(false),
 * }));
 */
declare function createConfigSchema<T>(prefix: string, schema: ZodSchema<T>): ConfigSchema<T>;

// --- Config injection ---

/**
 * Injects a validated configuration object.
 * Accepts either a @Configuration class or a zod ConfigSchema.
 * Startup fails if required values are missing or validation fails.
 *
 * @example
 * constructor(
 *     private readonly db = injectConfig(DatabaseConfig),
 *     private readonly app = injectConfig(AppConfig),
 *     private readonly optional = injectConfig(TelemetryConfig, true),
 * ) {}
 */
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>): T;
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>, optional: true): T | undefined;

// --- Config introspection ---

/**
 * Returns all registered configuration schemas (both @Configuration classes
 * and zod ConfigSchemas). Static — does not require a container instance.
 * Useful for generating JSON Schema, documentation, or CLI help text.
 */
declare function getAllRegisteredConfigurationNodes(): (Constructor<any> | ConfigSchema<any>)[];


// ============================================================
// ============================================================
//
//   E X A M P L E S
//
//   All examples below are declaration-only illustrations.
//   They show every API in context without real implementations.
//
// ============================================================
// ============================================================


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
        // basic injection — inject by class
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

@Component({ name: 'json' })
class JsonSerializer extends Serializer {
    contentType() { return 'application/json'; }
    serialize(data: any) { return JSON.stringify(data); }
    deserialize(raw: string) { return JSON.parse(raw); }
}

@Component({ name: 'xml' })
class XmlSerializer extends Serializer {
    contentType() { return 'text/xml'; }
    serialize(data: any) { return '<data/>'; }
    deserialize(raw: string) { return {}; }
}

@Component({ name: 'yaml' })
class YamlSerializer extends Serializer {
    contentType() { return 'text/yaml'; }
    serialize(data: any) { return ''; }
    deserialize(raw: string) { return {}; }
}

@Component()
class DataExporter {
    constructor(
        // inject a specific named component
        private readonly json = inject(Serializer, 'json'),

        // inject all implementations, sorted alphabetically by name
        private readonly allSerializers = injectAll(Serializer, 'alphabetical'),

        // inject as a name→instance Map
        private readonly serializerMap = injectMap(Serializer),

        // inject as a Set
        private readonly serializerSet = injectSet(Serializer),
    ) {}

    export(data: any, format: string): string {
        const serializer = this.serializerMap.get(format);
        if (!serializer) throw new Error(`Unknown format: ${format}`);
        return serializer.serialize(data);
    }

    supportedFormats(): string[] {
        return this.allSerializers.map(s => getComponentMetadata(s).name as string);
    }
}


// ============================================================
// Example 3: Token Providers
// ============================================================

// simple value token with factory
const AppName = token<string>(() => 'kavri-app');

// token with dependencies — factory uses inject() in default params
const DatabaseUrl = token<string>(
    (config = injectConfig(DatabaseConfiguration)) => `${config.driver}://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`
);

// token for an external class that needs lifecycle management
declare class ExternalHttpClient {
    constructor(baseUrl: string);
    get(path: string): Promise<any>;
    close(): Promise<void>;
}

const HttpClient = token<ExternalHttpClient>(
    (name = inject(AppName)) => new ExternalHttpClient(`https://api.example.com/${name}`),
    { onDestroy: (client) => client.close() }
);

// token as a "missing value" marker — forces the consumer to provide via Container.provide()
const SecretKey = token<string>(() => {
    throw new Error('SecretKey must be provided via container.provide()');
});


// ============================================================
// Example 4: Computed Providers (Config-driven Selection)
// ============================================================

// computed selects a named component based on config at runtime
// this is the standard pattern for strategy/driver selection

@Configuration("database")
class DatabaseConfiguration {
    driver!: string;      // 'mysql' | 'psql'
    host!: string;
    port!: number;
    username!: string;
    password!: string;
    database!: string;
}

abstract class Driver<TConn> {
    abstract connect(config: DatabaseConfiguration): Promise<TConn>;
    abstract execute<T>(conn: TConn, sql: string, values: any[]): Promise<T[]>;
    abstract close(conn: TConn): Promise<void>;
}

@Component({ name: 'mysql' })
class MysqlDriver extends Driver<unknown> {
    connect(config: DatabaseConfiguration) { return Promise.resolve(undefined); }
    execute<T>(conn: unknown, sql: string, values: any[]) { return Promise.resolve<T[]>([]); }
    close(conn: unknown) { return Promise.resolve(); }
}

@Component({ name: 'psql' })
class PsqlDriver extends Driver<unknown> {
    connect(config: DatabaseConfiguration) { return Promise.resolve(undefined); }
    execute<T>(conn: unknown, sql: string, values: any[]) { return Promise.resolve<T[]>([]); }
    close(conn: unknown) { return Promise.resolve(); }
}

// computed: select driver by config value
const SelectedDriver = computed<Driver<any>>(
    (config = injectConfig(DatabaseConfiguration), driver = inject(Driver, config.driver)) => driver
);

// computed: create connection using selected driver
const Connection = token<any>(
    (config = injectConfig(DatabaseConfiguration), driver = inject(SelectedDriver)) => driver.connect(config),
    { onDestroy: (conn, driver = inject(SelectedDriver), config = injectConfig(DatabaseConfiguration)) => driver.close(conn) }
);


// ============================================================
// Example 5: @Provide — Method Providers for External Classes
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

@Configuration("redis")
class RedisConfiguration {
    url!: string;
}

// @Provide can be used in any @Component class
@Component()
class InfraModule {
    @Provide(Sequelize, { onDestroy: 'close' })
    async createSequelize(dbUrl = inject(DatabaseUrl)): Promise<Sequelize> {
        const sequelize = new Sequelize(dbUrl, { logging: false });
        await sequelize.authenticate();
        return sequelize;
    }

    @Provide(Redis, { onDestroy: 'disconnect' })
    async createRedis(config = injectConfig(RedisConfiguration)): Promise<Redis> {
        const redis = new Redis();
        await redis.connect(config.url);
        return redis;
    }
}


// ============================================================
// Example 6: Circular References with injectRef
// ============================================================

@Component()
class OrderService {
    // forward reference to break circular dependency
    constructor(private readonly inventoryRef = injectRef(InventoryService)) {}

    async createOrder(productId: string, qty: number) {
        // access the reference only after construction
        const available = await this.inventoryRef.get().checkStock(productId, qty);
        if (!available) throw new Error('Insufficient stock');
    }
}

@Component()
class InventoryService {
    constructor(private readonly orderRef = injectRef(OrderService)) {}

    async checkStock(productId: string, qty: number): Promise<boolean> {
        return Promise.resolve(true);
    }

    async onOrderCancelled(orderId: string) {
        // use the reference
        void this.orderRef.get();
    }
}


// ============================================================
// Example 7: Scoped Providers
// ============================================================

// scoped: one instance per scope (e.g., per HTTP request)
@Component({ scope: 'scoped' })
class RequestContext {
    readonly requestId = Math.random().toString(36).slice(2);
    readonly startedAt = Date.now();
}

// transient: new instance every time it's injected
@Component({ scope: 'transient' })
class TraceSpan {
    readonly spanId = Math.random().toString(36).slice(2);
}

@Component()
class RequestHandler {
    constructor(
        // same instance within the scope
        private readonly ctx = inject(RequestContext),
        // unique instance per injection point
        private readonly span = inject(TraceSpan),
    ) {}
}

// usage with scopes:
//
//   const scope = container.createScope('request-1');
//   const handler = await scope.resolve(RequestHandler);
//   // handler.ctx.requestId is unique to this scope
//   // creating another scope gets a different RequestContext
//   const scope2 = container.createScope('request-2');
//   const handler2 = await scope2.resolve(RequestHandler);
//   // handler2.ctx.requestId !== handler.ctx.requestId
//   await scope.destroy();
//   await scope2.destroy();


// ============================================================
// Example 8: Lifecycle Hooks
// ============================================================

@Component()
class ConnectionPool {
    private pool: any;

    // phase 1: async init after construction
    @OnConstruct()
    async init() {
        this.pool = {}; // await createPool(...)
    }

    // phase 2: called after the full dependency graph is wired
    @OnApplicationReady()
    async warmUp() {
        // pre-populate connections
    }

    // phase 3: cleanup on destroy (reverse dependency order)
    @OnDestroy()
    async drain() {
        // await this.pool.drain()
    }
}

@Component()
class HealthCheck {
    constructor(
        private readonly pool = inject(ConnectionPool),
        private readonly logger = inject(Logger),
    ) {}

    @OnApplicationReady()
    async start() {
        this.logger.info('Health check: application is ready');
    }

    @OnDestroy()
    async stop() {
        this.logger.info('Health check: shutting down');
    }
}


// ============================================================
// Example 9: Conditional Components
// ============================================================

@Configuration("telemetry")
class TelemetryConfig {
    enabled!: boolean;
    endpoint!: string;
}

// this component is only registered if telemetry is enabled
@Component({
    condition: (config = injectConfig(TelemetryConfig, true)) => config?.enabled ?? false,
})
class TelemetryService {
    constructor(private readonly config = injectConfig(TelemetryConfig)) {}

    send(metric: string, value: number): void {}
}

@Component()
class AppService {
    constructor(
        // optional because TelemetryService might be disabled
        private readonly telemetry = inject(TelemetryService, true),
    ) {}

    doWork() {
        this.telemetry?.send('work.done', 1);
    }
}


// ============================================================
// Example 10: Event System — Class-based and Token-based
// ============================================================

// --- class-based events ---

@EventData('job.started')
class JobStartedEvent {
    constructor(
        public readonly jobId: string,
        public readonly startedAt: number = Date.now(),
    ) {}
}

@EventData('job.completed')
class JobCompletedEvent {
    constructor(
        public readonly jobId: string,
        public readonly result: any,
    ) {}
}

@EventData('job.failed')
class JobFailedEvent {
    constructor(
        public readonly jobId: string,
        public readonly error: Error,
    ) {}
}

// --- token-based events ---

const CacheInvalidated = event<{ key: string; reason: string }>();
const SystemShutdown = event<{ timeout: number }>();

// --- listeners ---

@Component()
class JobMetricsListener {
    constructor(private readonly telemetry = inject(TelemetryService, true)) {}

    @EventListener(JobStartedEvent)
    onJobStarted(ev: JobStartedEvent) {
        this.telemetry?.send('job.started', 1);
    }

    @EventListener(JobCompletedEvent)
    onJobCompleted(ev: JobCompletedEvent) {
        this.telemetry?.send('job.completed', 1);
    }

    @EventListener(JobFailedEvent)
    onJobFailed(ev: JobFailedEvent) {
        this.telemetry?.send('job.failed', 1);
    }
}

@Component()
class CacheManager {
    private readonly cache = new Map<string, any>();

    @EventListener(CacheInvalidated)
    onCacheInvalidated(data: { key: string; reason: string }) {
        this.cache.delete(data.key);
    }

    @EventListener(SystemShutdown)
    onShutdown(data: { timeout: number }) {
        this.cache.clear();
    }
}

// --- dispatching events ---

@Component()
class JobRunner {
    constructor(private readonly events = inject(EventDispatcher)) {}

    async run(jobId: string) {
        await this.events.dispatch(new JobStartedEvent(jobId));
        try {
            const result = {};
            await this.events.dispatch(new JobCompletedEvent(jobId, result));
        } catch (err: any) {
            await this.events.dispatch(new JobFailedEvent(jobId, err));
            throw err;
        }
    }

    async invalidateCache(key: string) {
        await this.events.dispatch(CacheInvalidated, { key, reason: 'manual' });
    }
}


// ============================================================
// Example 11: Configuration — Class-based and Zod-based
// ============================================================

// DatabaseConfiguration is already declared above (Example 4)
// TelemetryConfig is already declared above (Example 9)

// zod-based config (requires zod import)
declare const z: any;

const AppConfig = createConfigSchema('app', z.object({
    name: z.string().default('kavri-app'),
    env: z.enum(['dev', 'staging', 'prod']).default('dev'),
    debug: z.boolean().default(false),
    maxRetries: z.number().int().min(0).default(3),
}));

const CorsConfig = createConfigSchema('cors', z.object({
    origins: z.array(z.string()).default(['*']),
    methods: z.array(z.string()).default(['GET', 'POST']),
    credentials: z.boolean().default(false),
}));

@Component()
class ConfigConsumer {
    constructor(
        // class-based config
        private readonly dbConfig = injectConfig(DatabaseConfiguration),
        private readonly telemetryConfig = injectConfig(TelemetryConfig, true), // optional

        // zod-based config
        private readonly appConfig = injectConfig(AppConfig),
        private readonly corsConfig = injectConfig(CorsConfig),
    ) {}

    isDebug(): boolean {
        return this.appConfig.debug;
    }
}

// --- config-driven component selection using computed ---

const SelectedFormat = createConfigSchema('export', z.object({
    format: z.enum(['json', 'xml', 'yaml']).default('json'),
}));

const DefaultSerializer = computed<Serializer>(
    (config = injectConfig(SelectedFormat), s = inject(Serializer, config.format)) => s
);


// ============================================================
// Example 12: Module System — @Import, @Use, and Container APIs
// ============================================================

// any @Component can have @Provide methods
@Component()
class CacheModule {
    @Provide(Redis, { onDestroy: 'disconnect' })
    async createRedis(config = injectConfig(RedisConfiguration)): Promise<Redis> {
        const redis = new Redis();
        await redis.connect(config.url);
        return redis;
    }
}

@Component()
@Import(MysqlDriver, PsqlDriver)
class DatabaseModule {
    @Provide(Sequelize, { onDestroy: 'close' })
    async createSequelize(url = inject(DatabaseUrl)): Promise<Sequelize> {
        const seq = new Sequelize(url);
        await seq.authenticate();
        return seq;
    }
}

// subscriber that needs to be alive for side effects
@Component()
class RedisEventSubscriber {
    private readonly unsub: () => void;

    constructor(
        private readonly redis = inject(Redis),
        private readonly events = inject(EventDispatcher),
    ) {
        this.unsub = () => {}; // redis.subscribe(...)
    }

    @OnDestroy()
    dispose() {
        this.unsub();
    }
}

// application root: composes modules and side-effect components
@Import(JsonSerializer, XmlSerializer, YamlSerializer) // make all serializers available
@Use(CacheModule, DatabaseModule)                       // process @Provide methods
@Use(RedisEventSubscriber, JobMetricsListener)          // ensure side-effect components are alive
class Application {
    constructor(
        private readonly appConfig = injectConfig(AppConfig),
        private readonly serializers = injectAll(Serializer, 'alphabetical'),
        private readonly jobs = inject(JobRunner),
        private readonly events = inject(EventDispatcher),
    ) {}

    @OnApplicationReady()
    async onReady() {
        // application is fully wired
    }

    @OnDestroy()
    async onShutdown() {
        await this.events.dispatch(SystemShutdown, { timeout: 5000 });
    }
}


// ============================================================
// Example 13: Testing Patterns
// ============================================================

// testing is done via Container.provide() overrides — no special test API needed.

async function testUserService() {
    const container = new Container();

    // mock dependencies by overriding their factories
    container.provide(Logger, () => ({
        info() {},
        error() {},
    }));

    container.provide(UserRepository, () => ({
        findById: async (id: string) => ({ id, name: 'Test User' }),
        findAll: async () => [{ id: '1', name: 'Test User' }],
        save: async () => {},
    }));

    const service = await container.resolve(UserService);
    const user = await service.getUser('1');
    console.assert(user.name === 'Test User');

    await container.destroy();
}

// testing with scopes
async function testScopedService() {
    const container = new Container();

    const scope1 = container.createScope('test-scope-1');
    const ctx1 = await scope1.resolve(RequestContext);

    const scope2 = container.createScope('test-scope-2');
    const ctx2 = await scope2.resolve(RequestContext);

    // scoped instances are unique per scope
    console.assert(ctx1.requestId !== ctx2.requestId);

    await scope1.destroy();
    await scope2.destroy();
    await container.destroy();
}

// testing conditional components
async function testConditionalComponent() {
    const container = new Container();

    // force-enable telemetry for testing
    container.provide(TelemetryConfig, () => ({
        enabled: true,
        endpoint: 'http://localhost:9090',
    }) as any);

    const telemetry = await container.resolve(TelemetryService);
    telemetry.send('test.metric', 42);

    await container.destroy();
}

// testing events
async function testEventDispatching() {
    const received: JobStartedEvent[] = [];

    const container = new Container();

    // listener that captures events
    @Component()
    class TestJobListener {
        @EventListener(JobStartedEvent)
        onStart(ev: JobStartedEvent) {
            received.push(ev);
        }
    }

    container.import(TestJobListener);
    container.use(TestJobListener);

    const dispatcher = await container.resolve(EventDispatcher);
    await dispatcher.dispatch(new JobStartedEvent('test-job'));

    console.assert(received.length === 1);
    console.assert(received[0].jobId === 'test-job');

    await container.destroy();
}


// ============================================================
// Example 14: Full Application — Combining Everything
// ============================================================

// config files: app.yaml
// ---
// app:
//   name: pet-store
//   env: prod
// database:
//   driver: psql
//   host: db.example.com
//   port: 5432
//   username: admin
//   password: secret
//   database: petstore
// redis:
//   url: redis://cache.example.com:6379
// telemetry:
//   enabled: true
//   endpoint: https://telemetry.example.com

// --- domain model ---

abstract class Pet {
    abstract speech(): string;
}

@Component({ name: 'dog' })
class Dog extends Pet {
    speech() { return 'woof'; }
}

@Component({ name: 'cat' })
class Cat extends Pet {
    speech() { return 'meow'; }
}

@Component({ name: 'bird' })
class Bird extends Pet {
    speech() { return 'tweet'; }
}

// --- repository layer ---

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
    update(input: T): Promise<T> { return Promise.resolve(input); }
    delete(id: string): Promise<void> { return Promise.resolve(); }
}

interface PetRecord {
    id: string;
    name: string;
    species: string;
    greeting: string;
}

@Component()
class PetRepository extends Repository<PetRecord> {
    tableName() { return 'pets'; }
}

// --- redis integration module ---

const RedisUrl = token<string>(
    (config = injectConfig(RedisConfiguration)) => config.url
);

const RedisEvent = event<{ event: string; data: any }>();

@Component()
class RedisPublisher {
    constructor(private readonly redis = inject(Redis)) {}

    async publish(event: string, delay: number, data: any): Promise<void> {
        // await this.redis.set(...)
    }
}

@Component()
class RedisSubscriber {
    constructor(
        private readonly redis = inject(Redis),
        private readonly events = inject(EventDispatcher),
    ) {
        // subscribe to redis channel and forward to event dispatcher
    }

    @OnDestroy()
    dispose() {
        // unsubscribe
    }
}

@Component()
class RedisModule {
    @Provide(Redis, { onDestroy: 'disconnect' })
    async createRedis(url = inject(RedisUrl)): Promise<Redis> {
        const redis = new Redis();
        await redis.connect(url);
        return redis;
    }
}

// --- application events ---

@EventData('pet.adopted')
class PetAdoptedEvent {
    constructor(
        public readonly petId: string,
        public readonly species: string,
    ) {}
}

// --- application config ---

@Configuration("petstore")
class PetStoreConfig {
    defaultPet!: string;     // petstore.defaultPet: 'dog'
    maxPetsPerUser!: number; // petstore.maxPetsPerUser: 5
}

// --- application entry point ---

@Import(Dog, Cat, Bird)                        // register all pet implementations
@Import(PsqlDriver)                            // only psql driver available
@Use(RedisModule)                              // process redis @Provide methods
@Use(RedisSubscriber, JobMetricsListener)      // start side-effect components
class PetStoreApplication {
    constructor(
        private readonly config = injectConfig(PetStoreConfig),
        private readonly appConfig = injectConfig(AppConfig),
        private readonly petRepo = inject(PetRepository),
        private readonly allPets = injectAll(Pet, 'alphabetical'),
        private readonly defaultPet = inject(Pet, config.defaultPet),
        private readonly events = inject(EventDispatcher),
        private readonly publisher = inject(RedisPublisher),
        private readonly telemetry = inject(TelemetryService, true),
    ) {}

    @OnConstruct()
    async init() {
        // post-construction async initialization
        await this.publisher.publish('app.started', 0, { name: this.appConfig.name });
    }

    @OnApplicationReady()
    async ready() {
        // the full dependency graph is wired
        const species = this.allPets.map(p => getComponentMetadata(p).name as string);
        this.telemetry?.send('app.ready', 1);
    }

    async adoptPet(userId: string, species: string): Promise<PetRecord> {
        const pet = this.allPets.find(p => getComponentMetadata(p).name === species);
        if (!pet) throw new Error(`Unknown species: ${species}`);

        const record = await this.petRepo.create({
            id: Math.random().toString(36).slice(2),
            name: species,
            species,
            greeting: pet.speech(),
        });

        await this.events.dispatch(new PetAdoptedEvent(record.id, species));
        return record;
    }

    @OnDestroy()
    async shutdown() {
        await this.events.dispatch(SystemShutdown, { timeout: 5000 });
    }
}

// --- bootstrap ---

const container = new Container();

// customize config sources
container.provide(ConfigOptions, (defaults = inject(ConfigOptions)) => ({
    ...defaults,
    configFiles: ['config/app.yaml', 'config/app.local.yaml'],
    envPrefix: 'PETSTORE_',
}));

// resolve and run
const app = await container.resolve(PetStoreApplication);

await app.adoptPet('user-1', 'cat');

// graceful shutdown
await container.destroy();

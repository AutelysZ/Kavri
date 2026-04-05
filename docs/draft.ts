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

declare const Metadata: {
    of<T>(classDecoratorFactory: ClassDecoratorFactory<T>, factory: Injectable<any>): readonly T[];
    of<T>(classDecoratorFactory: ClassDecoratorFactory<T>, instance: object): readonly T[];
    of<T>(methodDecoratorFactory: MethodDecoratorFactory<T>, factory: Injectable<any>, key: Qualifier): readonly T[];
    of<T>(methodDecoratorFactory: MethodDecoratorFactory<T>, instance: object, key: Qualifier): readonly T[];
    of<T>(methodDecoratorFactory: MethodDecoratorFactory<T>, method: Function): readonly T[];

    decorate<T>(classDecoratorFactory: ClassDecoratorFactory<T>, factory: Injectable<any>, metadata: T): void;
    decorate<T>(classDecoratorFactory: MethodDecoratorFactory<T>, factory: Injectable<any>, key: Qualifier, metadata: T): void;
}

type ClassDecoratorFactory<T> = (...args: any[]) => ClassDecorator<T>

declare function createClassDecorator<T>(factory: ClassDecoratorFactory<T>, metadata: T, extra?: ClassDecorator<any>[]): ClassDecorator<T>;

interface ComponentMetadata extends ComponentOptions {
}

interface ControllerMetadata {
    path: string;
}

function Example_Controller(path: string, options?: ComponentOptions): ClassDecorator<ControllerMetadata> {
    return createClassDecorator<ControllerMetadata>(Example_Controller, {path}, [Component(options)])
}

type MethodDecoratorFactory<T> = (...args: any[]) => MethodDecorator<T>

declare function createMethodDecorator<T>(factory: MethodDecoratorFactory<T>, metadata: T, extra?: ClassDecorator<any>[]): MethodDecorator<T>;

interface ProvideMetadata<T> extends ProvideOptions<T> {
    injectable: Injectable<T>;
    factory: () => Awaitable<T>;
}

// show example of metadata usage, @Provide is moved to class decorator
function Example_Provide<T>(injectable: Injectable<T>, factory: () => Awaitable<T>, options?: ProvideOptions<T>): MethodDecorator<ProvideMetadata<T>> {
    return createMethodDecorator<ProvideMetadata<T>>(Example_Provide, {...options, injectable, factory});
}

type DecoratorStatic<T> = {
    readonly __metadata__: T | undefined;
}

/**
 * Hybrid class decorator: works with both TypeScript experimental decorators
 * and TC39 Stage 3 decorators. No reflect-metadata dependency.
 */
type ClassDecorator<T> =
    globalThis.ClassDecorator
    & ((target: Function, context: ClassDecoratorContext) => void)
    & DecoratorStatic<T>;

/** Hybrid method decorator for both decorator styles. */
type MethodDecorator<T> =
    globalThis.MethodDecorator
    & ((target: Function, context: ClassMethodDecoratorContext) => void)
    & DecoratorStatic<T>;

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
     * Runs in an inject context — can use inject() in default params.
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
declare function Component(options?: ComponentOptions): ClassDecorator<ComponentMetadata>;

// ============================================================
// Section 3: Lifecycle Decorators
// ============================================================

/**
 * Called after the instance is constructed and all synchronous dependencies are injected.
 * May be async — the container waits for completion before making the instance available.
 * Use for async initialization: opening connections, warming caches, etc.
 */
declare function OnConstruct(): MethodDecorator<{}>;

/**
 * Called during container/scope destroy, in reverse dependency order.
 * Use for cleanup: closing connections, flushing buffers, releasing resources.
 */
declare function OnDestroy(): MethodDecorator<{}>;

// ============================================================
// Section 4: Providers — Token
// ============================================================

/**
 * A typed token representing an injectable value.
 * Created via token(). Can be overridden via Container.provide() or @Provide.
 */
declare class Token<T> {
    readonly factory: () => Awaitable<T>;
}

/**
 * Creates a typed token with a factory default.
 * The factory runs in an inject context — use inject() in default params.
 *
 * @example
 * const AppName = token<string>(() => 'my-app');
 *
 * const DbUrl = token<string>((config = inject(DatabaseConfig)) => config.url);
 *
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
 * @example
 * const SelectedDriver = computed<Driver>(
 *     (config = inject(DbConfig), driver = inject(Driver, config.driver)) => driver
 * );
 */
declare function computed<T>(resolve: () => Awaitable<T>): Computed<T>;

// ============================================================
// Section 6: @Provide & @Decorate (Class Decorators)
// ============================================================

/**
 * Lifecycle hooks for provided instances.
 * Each hook can be a no-arg method name on the instance or a callback.
 * Extends ComponentOptions so providers can have name, scope, and condition.
 */
interface ProvideOptions<T> extends ComponentOptions {
    /** Called after the instance is constructed/created. */
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    /** Called during destroy, in reverse dependency order. */
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

/**
 * Class decorator: registers a provider for a class or token.
 * Declarative equivalent of container.provide().
 *
 * The factory runs in an inject context — use inject() in default params.
 * Multiple @Provide decorators can be stacked on a single class.
 * The providers are registered when the class is used (via @Use or container.use()).
 *
 * @example
 * @Component()
 * @Provide(Sequelize, (url = inject(DbUrl)) => new Sequelize(url), { onDestroy: 'close' })
 * @Provide(Redis, async (config = inject(RedisConfig)) => {
 *     const redis = new Redis();
 *     await redis.connect(config.url);
 *     return redis;
 * }, { onDestroy: 'disconnect' })
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
 * Class decorator: wraps an existing provider with a decorator function.
 * Declarative equivalent of container.decorate().
 *
 * The decorator receives the previously resolved value and returns the new value.
 * Multiple @Decorate decorators are applied in order.
 *
 * @example
 * @Component()
 * @Decorate(ConfigOptions, (prev) => ({
 *     ...prev,
 *     configFiles: ['app.yaml', 'app.local.yaml'],
 * }))
 * class AppConfigModule {}
 */
declare function Decorate<T>(
    target: Injectable<T>,
    decorator: (previous: T) => Awaitable<T>,
): ClassDecorator<DecorateMetadata<T>>;

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
 *   4. @Provide / @Decorate factory parameters
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
 * Since injectRef is called in default parameters, evaluation is already deferred —
 * no wrapper function needed.
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
 * Only components that are touched/registered in the container are included.
 *
 * Also support inject all instance of a decorator decorated providers
 *
 * @param injectable
 * @param order — 'topological' (dependency order), 'provided' (registration order),
 *                'alphabetical' (by component name). Defaults to 'provided'.
 */
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, order?: CollectionOrder): readonly T[]
// replace injectSet
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, as: 'set'): ReadonlySet<T>;
// repace injectMap
declare function injectAll<T>(injectable: Injectable<T> | ClassDecoratorFactory<any>, as: 'map'): ReadonlyMap<Qualifier, T>;

// ============================================================
// Section 9: Module System — @Touch & @Use
// ============================================================

/**
 * Class decorator: makes the container aware of the listed injectables (registers them)
 * without instantiating them. Like Unix `touch` — acknowledge existence, nothing more.
 *
 * Use @Touch to declare which implementations should be available.
 * This is especially important for collection injection (injectAll/injectMap/injectSet)
 * where each implementation must be explicitly touched.
 *
 * @example
 * @Component()
 * @Touch(MysqlDriver, PsqlDriver)   // register drivers for injectAll(Driver)
 * class DatabaseModule {}
 */
declare function Touch(...injectables: Injectable<any>[]): ClassDecorator<readonly Injectable<any>[]>;

/**
 * Class decorator: ensures the listed injectables are instantiated (and their
 * @Provide/@Decorate decorators processed) before this class is resolved.
 *
 * Use @Use for:
 * - Components with @Provide/@Decorate that must be processed
 * - Side-effect components (event subscribers, background workers)
 * - Any component that must be alive before the decorated class runs
 *
 * @example
 * @Use(InfraModule, EventSubscriber, MetricsCollector)
 * class Application { ... }
 */
declare function Use(...injectables: Injectable<any>[]): ClassDecorator<readonly Injectable<any>[]>;

// ============================================================
// Section 10: Container & Scope
// ============================================================

/**
 * The root IoC container. Entry point for the application.
 *
 * Typical lifecycle:
 *   1. Create container
 *   2. Call provide()/decorate()/touch()/use() to configure
 *   3. Call resolve() to bootstrap the application
 *   4. Call destroy() for graceful shutdown
 */
declare class Container {
    /**
     * Register or replace a provider for an injectable.
     * The factory runs in an inject context.
     * Replaces any previous provider and clears any decorators for this target.
     *
     * @example
     * container.provide(Redis, async (url = inject(RedisUrl)) => {
     *     const redis = new Redis();
     *     await redis.connect(url);
     *     return redis;
     * }, { onDestroy: 'disconnect' });
     */
    provide<T>(target: Injectable<T>, factory: () => Awaitable<T>, options?: ProvideOptions<T>): void;

    /**
     * Wrap an existing provider. The decorator receives the previous resolved value
     * and returns the new value. Multiple decorators are applied in registration order.
     *
     * Unlike provide(), decorate() does not replace — it layers on top.
     * If provide() is called after decorate(), both previous decorators and the
     * previous factory are replaced.
     *
     * @example
     * container.decorate(ConfigOptions, (prev) => ({
     *     ...prev,
     *     configFiles: ['app.yaml'],
     *     envPrefix: 'MYAPP_',
     * }));
     */
    decorate<T>(target: Injectable<T>, decorator: (previous: T) => Awaitable<T>): void;

    /**
     * Make the container aware of injectables without instantiating them.
     * Needed for making specific implementations available for collection injection.
     *
     * @example
     * container.touch(PsqlDriver);       // only PsqlDriver available, not MysqlDriver
     * container.touch(Dog, Cat);          // both available in injectAll(Pet)
     */
    touch(...injectables: Injectable<any>[]): void;

    /**
     * Ensure injectables are instantiated (and their @Provide/@Decorate processed)
     * before any resolve() call.
     *
     * @example
     * container.use(InfraModule);         // process @Provide/@Decorate on InfraModule
     * container.use(RedisSubscriber);     // start the subscriber
     */
    use(...injectables: Injectable<any>[]): void;

    /**
     * Resolve an injectable. Returns a Promise that resolves after all async
     * initializers (@OnConstruct) in the dependency chain complete.
     */
    resolve<T>(injectable: Injectable<T>): Promise<T>;

    /**
     * Create a child scope for scoped providers.
     * Scoped components get fresh instances within each scope.
     * Singleton components are shared from the parent container.
     * Transient components are always fresh regardless of scope.
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

// Two ways to define events:
// 1. Class-based: mark with @Event(name?) — emitting an undecorated class is a runtime error.
// 2. Key-based: defineEvent<T>(name?) for lightweight typed events without a class.

/**
 * Marks a class as an event type. Required for class-based events.
 * Emitting an instance of an undecorated class is a runtime error.
 *
 * @param name Optional string identifier for logging, serialization, and debugging.
 */
declare function Event(name?: string): ClassDecorator<{ name: string | undefined }>;

/**
 * Marks a method as a listener for a specific event type.
 * Listeners are called in dependency order.
 */
declare function OnEvent<T>(event: AnyConstructor<T> | EventKey<T>): MethodDecorator<{
    event: AnyConstructor<T> | EventKey<T>
}>;

/**
 * A typed event key for key-based events.
 */
declare class EventKey<T> {
    readonly name?: string;
    readonly __data__: T | undefined;
}

/**
 * Creates a typed event key. The optional name is used for logging/debugging.
 */
declare function defineEvent<T>(name?: string): EventKey<T>;

/**
 * Built-in component for emitting events. Inject via inject(EventBus).
 * emit() is async — it waits for all listeners to complete.
 */
declare class EventBus {
    /** Emit a class-based event. The class must be decorated with @Event(). */
    emit<T>(event: T): Promise<void>;
    /** Emit a key-based event with data. */
    emit<T>(key: EventKey<T>, data: T): Promise<void>;
}

// ============================================================
// Section 12: Configuration Module (Zod only)
// ============================================================

/** Opaque Zod schema type (in real code: z.ZodType<T>). */
declare type ZodSchema<T> = unknown;

declare const z: any;

/**
 * Configuration source options.
 * Override via container.decorate(ConfigOptions, ...) to customize config loading.
 *
 * Source precedence (highest → lowest):
 *   1. container.provide() / @Provide runtime overrides
 *   2. CLI arguments (matched by argvPrefix)
 *   3. Environment variables (matched by envPrefix)
 *   4. Config files (yaml/json/toml, loaded in order — later files override)
 *   5. Zod schema defaults (.default())
 */
interface ConfigOptions {
    /** Config file paths. Supports yaml, json, toml. Loaded in order. */
    configFiles: string[];
    /** Environment variables. Typically process.env. */
    env: Record<string, string>;
    /** CLI arguments. Typically process.argv. */
    argv: string[];
    /** Prefix for env var mapping. 'APP_' maps APP_DATABASE_HOST → database.host. */
    envPrefix: string;
    /** Prefix for CLI arg mapping. '--app.' maps --app.database.host → database.host. */
    argvPrefix: string;
}

/** Token for ConfigOptions. Use container.decorate() to customize. */
declare const ConfigOptions: Token<ConfigOptions>;

interface ConfigurationMetadata<T> {
    prefix: string;
    schema: ZodSchema<T>;
}

declare function Configuration<T>(prefix: string, schema: ZodSchema<T>): ClassDecorator<ConfigurationMetadata<T>>;

/**
 * Creates a zod-based config schema bound to a prefix.
 * The prefix maps to a nested key path in config files:
 *   createConfigSchema('database', ...) → reads from `database:` in YAML
 *
 * @example
 * const DatabaseConfig = createConfigSchema('database', z.object({
 *     driver: z.string(),
 *     host: z.string(),
 *     port: z.number().default(5432),
 *     username: z.string(),
 *     password: z.string(),
 *     database: z.string(),
 * }));
 */
declare function createConfigSchema<T>(prefix: string, schema: ZodSchema<T>): Token<T>;

// ============================================================
// ============================================================
//
//   E X A M P L E S
//
// ============================================================
// ============================================================


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

@Component({name: 'json'})
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

@Component({name: 'xml'})
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

@Component({name: 'yaml'})
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
        private readonly serializerMap = injectAll(Serializer, 'map'),
        private readonly serializerSet = injectAll(Serializer, 'set'),
    ) {
    }

    export(data: any, format: string): string {
        const serializer = this.serializerMap.get(format);
        if (!serializer) throw new Error(`Unknown format: ${format}`);
        return serializer.serialize(data);
    }

    supportedFormats(): string[] {
        return this.allSerializers.map(s => Metadata.of(Component, s)[0].name as string);
    }
}


// ============================================================
// Example 3: Token Providers
// ============================================================

const AppName = token<string>(() => 'kavri-app');

const DatabaseConfig = createConfigSchema<{
    driver: string;
    host: string;
    port: string;
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

// token as a "missing value" marker — forces the consumer to provide via container.provide()
const SecretKey = token<string>(() => {
    throw new Error('SecretKey must be provided via container.provide()');
});


// ============================================================
// Example 4: Computed Providers (Config-driven Selection)
// ============================================================

// DatabaseConfig is declared above in Example 3

abstract class Driver<TConn> {
    abstract connect(): Promise<TConn>;

    abstract execute<T>(conn: TConn, sql: string, values: any[]): Promise<T[]>;

    abstract close(conn: TConn): Promise<void>;
}

@Component({name: 'mysql'})
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

@Component({name: 'psql'})
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

// computed: select driver by config
const SelectedDriver = computed<Driver<any>>(
    (config = inject(DatabaseConfig), driver = inject(Driver, config.driver)) => driver
);

// token: create connection using selected driver
const Connection = token<any>(
    (driver = inject(SelectedDriver)) => driver.connect(),
);


// ============================================================
// Example 5: @Provide & @Decorate — Class Decorators
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

const RedisConfig = createConfigSchema<{
    url: string;
}>('redis', z.object({
    url: z.string(),
}));

// @Provide stacks on a @Component class — each registers a provider
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
class InfraModule {
}

// @Decorate wraps an existing provider — here we customize ConfigOptions
@Component()
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml', 'config/app.local.yaml'],
    envPrefix: 'MYAPP_',
}))
class AppConfigModule {
}


// ============================================================
// Example 6: Circular References with injectRef
// ============================================================

@Component()
class OrderService {
    constructor(private readonly inventoryRef: Ref<InventoryService> = injectRef(InventoryService)) {
    }

    async createOrder(productId: string, qty: number) {
        const available = await this.inventoryRef.get().checkStock(productId, qty);
        if (!available) throw new Error('Insufficient stock');
    }
}

@Component()
class InventoryService {
    constructor(private readonly orderRef: Ref<OrderService> = injectRef(OrderService)) {
    }

    async checkStock(productId: string, qty: number): Promise<boolean> {
        return Promise.resolve(true);
    }

    async onOrderCancelled(orderId: string) {
        void this.orderRef.get();
    }
}


// ============================================================
// Example 7: Scoped Providers
// ============================================================

@Component({scope: 'scoped'})
class RequestContext {
    readonly requestId = Math.random().toString(36).slice(2);
    readonly startedAt = Date.now();
}

@Component({scope: 'transient'})
class TraceSpan {
    readonly spanId = Math.random().toString(36).slice(2);
}

@Component()
class RequestHandler {
    constructor(
        private readonly ctx = inject(RequestContext),
        private readonly span = inject(TraceSpan),
    ) {
    }
}

// usage:
//   const scope = container.createScope('request-1');
//   const handler = await scope.resolve(RequestHandler);
//   await scope.destroy();


// ============================================================
// Example 8: Lifecycle Hooks
// ============================================================

@Component()
class ConnectionPool {
    private pool: any;

    @OnConstruct()
    async init() {
        this.pool = {}; // await createPool(...)
    }

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
    ) {
    }

    @OnDestroy()
    async stop() {
        this.logger.info('Health check: shutting down');
    }
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
    constructor(private readonly config = inject(TelemetryConfig)) {
    }

    send(metric: string, value: number): void {
    }
}

@Component()
class AppService {
    constructor(
        private readonly telemetry = inject(TelemetryService, true),
    ) {
    }

    doWork() {
        this.telemetry?.send('work.done', 1);
    }
}


// ============================================================
// Example 10: Event System
// ============================================================

@Event('job.started')
class JobStartedEvent {
    constructor(
        public readonly jobId: string,
        public readonly startedAt: number = Date.now(),
    ) {
    }
}

@Event('job.completed')
class JobCompletedEvent {
    constructor(
        public readonly jobId: string,
        public readonly result: any,
    ) {
    }
}

@Event('job.failed')
class JobFailedEvent {
    constructor(
        public readonly jobId: string,
        public readonly error: Error,
    ) {
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

    async invalidateCache(key: string) {
        await this.events.emit(CacheInvalidated, {key, reason: 'manual'});
    }
}


// ============================================================
// Example 11: Configuration
// ============================================================

// DatabaseConfig declared in Example 3
// TelemetryConfig declared in Example 9
// RedisConfig declared in Example 5

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
    methods: string;
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
    ) {
    }

    isDebug(): boolean {
        return this.appConfig.debug;
    }
}

// config-driven component selection using computed
const SelectedFormat = createConfigSchema<{ format: string }>('export', z.object({
    format: z.enum(['json', 'xml', 'yaml']).default('json'),
}));

const DefaultSerializer = computed<Serializer>(
    (config = inject(SelectedFormat), s = inject(Serializer, config.format)) => s
);


// ============================================================
// Example 12: Module System — @Touch, @Use, @Provide, @Decorate
// ============================================================

// module with @Provide: provides Redis and Sequelize
@Component()
@Provide(Redis, async (config = inject(RedisConfig)) => {
    const redis = new Redis();
    await redis.connect(config.url);
    return redis;
}, {onDestroy: 'disconnect'})
class CacheModule {
}

@Component()
@Touch(MysqlDriver, PsqlDriver)
@Provide(Sequelize, async (url = inject(DatabaseUrl)) => {
    const seq = new Sequelize(url);
    await seq.authenticate();
    return seq;
}, {onDestroy: 'close'})
class DatabaseModule {
}

// module with @Decorate: customizes config
@Component()
@Decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml'],
}))
class ConfigModule {
}

// subscriber — side-effect component, needs @Use to stay alive
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

// application root
@Touch(JsonSerializer, XmlSerializer, YamlSerializer)
@Use(ConfigModule, CacheModule, DatabaseModule)
@Use(RedisEventSubscriber, JobMetricsListener)
class Application {
    constructor(
        private readonly appConfig = inject(AppConfig),
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

declare var console: {
    assert(value: boolean): void;
}

// ============================================================
// Example 13: Testing Patterns
// ============================================================

async function testUserService() {
    const container = new Container();

    container.provide(Logger, () => ({
        info() {
        }, error() {
        }
    }));
    container.provide(UserRepository, () => ({
        findById: async (id: string) => ({id, name: 'Test User'}),
        findAll: async () => [{id: '1', name: 'Test User'}],
        save: async () => {
        },
    }));

    const service = await container.resolve(UserService);
    const user = await service.getUser('1');
    console.assert(user.name === 'Test User');
    await container.destroy();
}

async function testScopedService() {
    const container = new Container();

    const scope1 = container.createScope('test-1');
    const ctx1 = await scope1.resolve(RequestContext);
    const scope2 = container.createScope('test-2');
    const ctx2 = await scope2.resolve(RequestContext);

    console.assert(ctx1.requestId !== ctx2.requestId);

    await scope1.destroy();
    await scope2.destroy();
    await container.destroy();
}

async function testConditionalComponent() {
    const container = new Container();

    // force telemetry config for testing
    container.provide(TelemetryConfig, () => ({
        enabled: true,
        endpoint: 'http://localhost:9090',
    }));

    const telemetry = await container.resolve(TelemetryService);
    telemetry.send('test.metric', 42);
    await container.destroy();
}

async function testEventDispatching() {
    const received: JobStartedEvent[] = [];

    const container = new Container();

    @Component()
    class TestJobListener {
        @OnEvent(JobStartedEvent)
        onStart(ev: JobStartedEvent) {
            received.push(ev);
        }
    }

    container.touch(TestJobListener);
    container.use(TestJobListener);

    const bus = await container.resolve(EventBus);
    await bus.emit(new JobStartedEvent('test-job'));

    console.assert(received.length === 1);
    console.assert(received[0].jobId === 'test-job');
    await container.destroy();
}

// test with decorate — override config for testing
async function testWithConfigOverride() {
    const container = new Container();

    container.decorate(ConfigOptions, (prev) => ({
        ...prev,
        configFiles: ['config/test.yaml'],
    }));

    const app = await container.resolve(ConfigConsumer);
    console.assert(app.isDebug() === false);
    await container.destroy();
}

// test custom metadata
async function testCustomMetadata() {
    function Priority(value: number): ClassDecorator<number> {
        return createClassDecorator(Priority, value);
    }

    @Component()
    @Priority(10)
    class HighPriorityService {
    }

    console.assert(Metadata.of(Priority, HighPriorityService)[0] === 10);
    console.assert(Metadata.of(Priority, HighPriorityService).length === 1);
}


// ============================================================
// Example 14: Full Application — Combining Everything
// ============================================================

// config: app.yaml
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

@Component({name: 'dog'})
class Dog extends Pet {
    speech() {
        return 'woof';
    }
}

@Component({name: 'cat'})
class Cat extends Pet {
    speech() {
        return 'meow';
    }
}

@Component({name: 'bird'})
class Bird extends Pet {
    speech() {
        return 'tweet';
    }
}

// --- repository layer ---

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

    update(input: T): Promise<T> {
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

// --- redis integration ---

const RedisUrl = token<string>(
    (config = inject(RedisConfig)) => config.url
);

const RedisEvent = defineEvent<{ event: string; data: any }>('redis');

@Component()
class RedisPublisher {
    constructor(private readonly redis = inject(Redis)) {
    }

    async publish(event: string, delay: number, data: any): Promise<void> {
    }
}

@Component()
class RedisSubscriber {
    constructor(
        private readonly redis = inject(Redis),
        private readonly events = inject(EventBus),
    ) {
    }

    @OnDestroy()
    dispose() {
    }
}

@Component()
@Provide(Redis, async (url = inject(RedisUrl)) => {
    const redis = new Redis();
    await redis.connect(url);
    return redis;
}, {onDestroy: 'disconnect'})
class RedisModule {
}

// --- application events ---

@Event('pet.adopted')
class PetAdoptedEvent {
    constructor(
        public readonly petId: string,
        public readonly species: string,
    ) {
    }
}

// --- application config ---

const PetStoreConfig = createConfigSchema<{
    defaultPet: string;
    maxPetsPerUser: number;
}>('petstore', z.object({
    defaultPet: z.string().default('dog'),
    maxPetsPerUser: z.number().default(5),
}));

// --- application entry point ---

@Touch(Dog, Cat, Bird)
@Touch(PsqlDriver)
@Use(RedisModule)
@Use(RedisSubscriber, JobMetricsListener)
class PetStoreApplication {
    constructor(
        private readonly config = inject(PetStoreConfig),
        private readonly appConfig = inject(AppConfig),
        private readonly petRepo = inject(PetRepository),
        private readonly allPets = injectAll(Pet, 'alphabetical'),
        private readonly defaultPet = inject(Pet, config.defaultPet),
        private readonly events = inject(EventBus),
        private readonly publisher = inject(RedisPublisher),
        private readonly telemetry = inject(TelemetryService, true),
    ) {
    }

    @OnConstruct()
    async init() {
        await this.publisher.publish('app.started', 0, {name: this.appConfig.name});
    }

    async adoptPet(userId: string, species: string): Promise<PetRecord> {
        const pet = this.allPets.find(p => Metadata.of(Component, p)[0].name === species);
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

// --- bootstrap ---

const container = new Container();

// customize config via decorate (no self-reference)
container.decorate(ConfigOptions, (prev) => ({
    ...prev,
    configFiles: ['config/app.yaml', 'config/app.local.yaml'],
    envPrefix: 'PETSTORE_',
}));

const app = await container.resolve(PetStoreApplication);
await app.adoptPet('user-1', 'cat');
await container.destroy();

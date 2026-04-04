export {}

type Qualifier = string | symbol;
type ProviderScope = 'singleton' | 'scoped' | 'transient';
type Awaitable<T> = T | Promise<T>;
type ClassDecorator = globalThis.ClassDecorator & ((target: Function, context: ClassDecoratorContext) => void);
type MethodDecorator = globalThis.MethodDecorator & ((target: Function, context: ClassMethodDecoratorContext) => void);
type AnyConstructor<T> = abstract new (...args: any[]) => T;
type Constructor<T> = abstract new () => T;
type NoArgsMethodKeyof<T> = { [P in keyof T]-?: T[P] extends () => any ? P : never; }[keyof T]
export type CollectionOrder = 'topological' | 'provided' | 'alphabetical';

// define injectable

// component
interface ComponentOptions {
    name?: Qualifier;
    scope?: ProviderScope;
    // Whether this component is enabled.
    // enabled by default without this method
    condition?: () => Awaitable<boolean>;
}

declare function Component(options?: ComponentOptions): ClassDecorator;

// component lifecycles
declare function OnConstruct(): MethodDecorator;

declare function OnApplicationReady(): MethodDecorator;

declare function OnDestroy(): MethodDecorator;

// external classes
interface ProvideOptions<T> extends ComponentOptions {
    onConstruct?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    onApplicationReady?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
    onDestroy?: NoArgsMethodKeyof<T> | ((instance: T) => Awaitable<void>);
}

declare function Provide<T>(clazz: AnyConstructor<T>, options?: ProvideOptions<T>): MethodDecorator;

// values
declare class Token<T> {
    readonly factory: () => Awaitable<T>;
}

declare function token<T>(factory: () => Awaitable<T>, options?: ProvideOptions<T>): Token<T>

type Injectable<T> = AnyConstructor<T> | Constructor<T> | Token<T> | Computed<T>;

// helpers:
// remove registry
// remove collection

declare class Computed<T> {
    readonly resolve: () => Awaitable<T>;
}

declare function computed<T>(resolve: () => Awaitable<T>): Computed<T>;

// reflection
declare function getComponentMetadata<T>(target: Injectable<T> | T): ProvideOptions<T>

// inject injectable
declare class Ref<T> {
    get(): T;
}

// basic
// at any inject point, set global variable to allow the `inject` method
// the global variable should be a stack, to allow nested containers and
// scopes. which means, all inject method can only be called at the inject
// points synchronously. The inject point include:
// 1. check provider's condition
// 2. call provider's constructor, include: token factory, class, provider method
// which means, all these method can use default value to inject instancies
//
// about async providers:
// for class, allow use @OnConstruct() to define a async initializer
// for token()/@Provide(), allow async onConstruct option and async factory method
// for these scenarios, the inject method uses React's suspense style
// to handle it. We assume all inject methods are called before any side effects.
// then:
// when inject a injectable, if it is not ready, throw a promise to interrupt
// the instantiate process. Once it's fulfilled, re-call the factory method of the
// target injectable. Loop until it returns without rejected injectable promise.
declare function inject<T>(injectable: Injectable<T>): T
declare function inject<T>(injectable: Injectable<T>, name: Qualifier): T
declare function inject<T>(injectable: Injectable<T>, optional: true): T | undefined
declare function inject<T>(injectable: Injectable<T>, name: Qualifier, optional: true): T | undefined

// for circular references
declare function injectRef<T>(func: () => Injectable<T>): Ref<T>
declare function injectRef<T>(func: () => Injectable<T>, optional: true): Ref<T> | undefined

// for collections
// will instantiate all subclasses of the target class that decorated with @Component()
declare function injectAll<T>(injectable: Injectable<T>, order?: CollectionOrder): readonly T[]

declare function injectSet<T>(injectable: Injectable<T>): ReadonlySet<T>;

declare function injectMap<T>(injectable: Injectable<T>): ReadonlyMap<Qualifier, T>;

// for modules
declare function Import(...injectables: Injectable<any>[]): ClassDecorator;

declare function Use(...injectables: Injectable<any>[]): ClassDecorator;

// container
declare class Container {
    // inject/replace an injectable's value
    provide<T>(target: Injectable<T>, factory: () => Awaitable<T>, options?: ProvideOptions<T>): void;

    // ensure an injectable is imported, do nothing actually
    import(...injectables: Injectable<any>[]): void;

    // ensure these injectable is instantiated in use order before resolving anything
    use(...injectables: Injectable<any>[]): void;

    resolve<T>(injectable: Injectable<T>): Promise<T>;

    destroy(): Promise<void>;
}

// event system
// two ways: use an event class or event token

declare function EventData(name: string): ClassDecorator;

declare function EventListener<T>(data: AnyConstructor<T> | Event<T>): MethodDecorator;

declare class Event<T> {
    readonly data: T;
}

declare function event<T>(): Event<T>;

declare class EventDispatcher {
    dispatch<T>(data: T): Promise<void>;
    dispatch<T>(event: Event<T>, data: T): Promise<void>;
}

// config module, features:
// 1. support zod|class-validator
// 2. support yaml|toml|json
// 3. support config file|env|cli options
// 4. support placeholders
// 5. support providers like aws secret manager

// module basic config
// allow specifying config files, env, cli argv
interface ConfigOptions {
    configFiles: string[];
    env: Record<string, string>;
    argv: string[];
    envPrefix: string;
    argvPrefix: string;
}

// allow fully control of the config source
declare const ConfigOptions: Token<ConfigOptions>

declare function Configuration(prefix: string): ClassDecorator;

declare type ZodSchema<T> = unknown;

declare class ConfigSchema<T> {
    readonly schema: ZodSchema<T>;
}

declare function createConfigSchema<T>(prefix: string, schema: ZodSchema<T>): ConfigSchema<T>

// injectors
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>): T;
declare function injectConfig<T>(node: Constructor<T> | ConfigSchema<T>, optional: true): T | undefined;

// helpers
// get all registered configuration nodes, include class and zod schema
// use for generating json schema or something else
// this is static, doesn't depend on container
declare function getAllRegisteredConfigurationNodes(): any;

// module:
// A module entry point is not required.
// unless it needs to provide/import/use something

// --- example

@Configuration("database")
class DatabaseConfiguration {
    driver: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}

abstract class Driver<TConn> {
    abstract connect(config: DatabaseConfiguration): Promise<TConn>;

    abstract execute<T>(conn: TConn, sql: string, values: any[]): Promise<T[]>;
}

@Component({name: 'mysql'})
class MysqlDriver extends Driver<unknown> {
    connect(config: DatabaseConfiguration): Promise<unknown> {
        return Promise.resolve(undefined);
    }

    execute<T>(conn: unknown, sql: string, values: any[]): Promise<T[]> {
        return Promise.resolve([]);
    }
}

@Component({name: 'psql'})
class PsqlDriver extends Driver<unknown> {
    connect(config: DatabaseConfiguration): Promise<unknown> {
        return Promise.resolve(undefined);
    }

    execute<T>(conn: unknown, sql: string, values: any[]): Promise<T[]> {
        return Promise.resolve([]);
    }
}


const driverSelector = computed<Driver<any>>((config = injectConfig(DatabaseConfiguration), driver = inject(Driver, config.driver)) => driver);

const Conn = token<any>((config = injectConfig(DatabaseConfiguration), driver = inject(Driver, config.driver)) => driver.connect(config));

@Component()
abstract class Repository<T> {
    constructor(
        private readonly conn = inject(Conn),
        private readonly driver = inject(driverSelector),
    ) {
    }

    abstract tableName(): string

    findOne(id: string): Promise<T> {
        return Promise.resolve<any>(void 0);
    }

    findAll(): Promise<readonly T[]> {
        return Promise.resolve<any>(void 0);
    }

    create(input: T): Promise<T> {
        return Promise.resolve<any>(void 0);
    }

    update(input: T): Promise<T> {
        return Promise.resolve<any>(void 0);
    }

    delete(id: string): Promise<void> {
        return Promise.resolve<any>(void 0);
    }
}

// super class don't need @Component()
abstract class Pet {
    abstract speech(): string;
}

@Component({name: 'dog'})
class Dog extends Pet {
    speech(): string {
        return "woof";
    }
}

@Component({name: 'cat'})
class Cat extends Pet {
    speech(): string {
        return "meow";
    }
}

interface Job {
    pets: string[];
    targetPet: string;
    greet: string;
}

@Component()
class JobRepository extends Repository<Job> {
    tableName(): string {
        return "job";
    }
}

declare class RedisClient {
    connect(url: string): Promise<void>;

    disconnect(): Promise<void>;

    exec(cmd: string): Promise<any>;

    pub(event: string, delay: number, data: any): Promise<void>;

    sub(fn: (event: string, data: any) => any): () => void;
}

const RedisEvent = event<{ event: string, data: any }>();

@Component()
class RedisEventDispatcher {
    constructor(private readonly client = inject(RedisClient)) {
    }

    async dispatch(event: string, delay: number, data: any): Promise<void> {
        await this.client.pub(event, delay, data);
    }
}

@Component()
class RedisEventSubscriber {
    private readonly disposer: () => void;

    constructor(private readonly client = inject(RedisClient), private readonly eventDispatcher = inject(EventDispatcher)) {
        this.disposer = this.client.sub((event, data) => {
            void this.eventDispatcher.dispatch(RedisEvent, {event, data})
        });
    }

    @OnDestroy()
    dispose() {
        this.disposer();
    }
}

const RedisURL = token<string>(() => {
    throw new Error('Redis URL is missing');
});

class RedisModule {
    @Provide(RedisClient, {onDestroy: 'disconnect'})
    async getClient(url = inject(RedisURL)): Promise<RedisClient> {
        const client = new RedisClient();
        await client.connect(url);
        return client;
    }
}

@EventData('job.start')
class JobStartEvent {
}

@EventData('job.end')
class JobEndEvent {
}

@Configuration("metrics")
class MetricsConfiguration {
    enabled!: boolean;
}

@Component({
    condition: (config = injectConfig(MetricsConfiguration)) => config.enabled,
})
class Metrics {
    log(event: string, data: any) {
    }
}

@Component()
class AppEventListener {
    constructor(private readonly metrics = inject(Metrics, true)) {
    }

    @EventListener(JobStartEvent)
    async handleJobStart(event: JobStartEvent) {
        this.metrics?.log('job.start', event);
    }

    @EventListener(JobEndEvent)
    async handleJobEnd(event: JobEndEvent) {
        this.metrics?.log('job.end', event);
    }

    @EventListener(RedisEvent)
    handleRedisEvent(event: any) {
        this.metrics?.log('redis.' + event.event, event.data);
    }
}

@Configuration("app")
class AppConfiguration {
    pet!: string;
}

// use decorator to import, or use a component
@Import(Dog, Pet)
@Use(AppEventListener)
class Application {
    constructor(
        private readonly config = injectConfig(AppConfiguration),
        private readonly jobRepository = inject(JobRepository),
        private readonly pets = injectAll(Pet, 'alphabetical'),
        private readonly pet = inject(Pet, config.pet),
        private readonly eventDispatcher = inject(EventDispatcher),
        private readonly redisEventDispatcher = inject(RedisEventDispatcher),
    ) {
    }

    @OnConstruct()
    async init() {
        await this.redisEventDispatcher.dispatch('app.start', 10, {});
    }

    async run() {
        await this.eventDispatcher.dispatch(new JobStartEvent());
        const greet = this.pet.speech();
        await this.jobRepository.create({
            pets: this.pets.map(t => getComponentMetadata(t).name as string),
            targetPet: this.config.pet,
            greet: greet,
        });
        await this.eventDispatcher.dispatch(new JobEndEvent());
    }
}

const container = new Container();

container.provide(ConfigOptions, (config = inject(ConfigOptions)) => ({
    ...config,
    configFiles: ['app.json'],
}));

// to provide drivers
// only psql provided, so the app config can only use psql
container.import(PsqlDriver)

// to provide RedisClient
container.use(RedisModule);
// to listen redis event
container.use(RedisEventSubscriber);

const app = await container.resolve(Application);

await app.run();

await container.destroy();
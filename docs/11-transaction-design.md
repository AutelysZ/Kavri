# Transaction Design

Transaction management in `@kavri/web`. AOP mechanism in `@kavri/container` (see [01-container-design.md](./01-container-design.md#10-aop)).
ORM drivers: `@kavri/drizzle`, `@kavri/sequelize`.

## 1. Transaction Types

```ts
enum Isolation {
    ReadUncommitted = 'read uncommitted',
    ReadCommitted = 'read committed',
    RepeatableRead = 'repeatable read',
    Serializable = 'serializable',
}

enum Propagation {
    Required = 'required',
    RequiresNew = 'requires_new',
    Supports = 'supports',
    Mandatory = 'mandatory',
    NotSupported = 'not_supported',
    Never = 'never',
}

interface DataSourceResolveOptions {
    driver?: Qualifier;
    dataSource?: Qualifier;
    /** The instance, class, or any value requesting the connection. Used by resolvers for routing. */
    target?: any;
}

interface TransactionOptions extends DataSourceResolveOptions {
    isolation?: Isolation;
    propagation?: Propagation;
    timeout?: number;
}
```

## 2. @Transactional

```ts
declare function Transactional(options?: TransactionOptions): AspectMethodDecorator<TransactionOptions>;

@Component()
class TransactionalAspect extends MethodAspect<TransactionOptions> {
    constructor(private readonly tm = inject(TransactionManager)) {}

    around(metadata: TransactionOptions, instance: any, method: Function, args: any[]) {
        const options = metadata.target ? metadata : { ...metadata, target: instance };
        return this.tm.begin(options, (tx) => method.apply(instance, args));
    }
}
```

## 3. DataSourceOptions (standardized config)

Unified data source configuration. Drivers that follow this structure don't need their own config class.

```ts
@Schema()
class InstanceOptions {
    @IsString({ optional: true }) host?: string;
    @IsInteger({ optional: true }) port?: number;
    @IsString({ optional: true }) username?: string;
    @IsString({ optional: true }) password?: string;
    @IsString({ optional: true }) database?: string;
    @IsString({ optional: true }) schema?: string;
    @IsAny({ optional: true }) dialectOptions?: any;
}

@Schema()
class ClusterOptions extends InstanceOptions {
    @IsString({ optional: true }) name?: string;
    @IsString() dialect!: string;         // 'postgres', 'mysql', 'sqlite', etc.
    @IsString({ optional: true }) driver?: string;  // driver name, e.g., 'drizzle', 'sequelize'
    @IsArray(Ref(() => InstanceOptions), { optional: true }) readReplicas?: InstanceOptions[];
    @IsInteger({ optional: true }) maxConnections?: number;
    @IsInteger({ optional: true }) minConnections?: number;
    @IsInteger({ optional: true }) connectionTimeout?: number;
    @IsInteger({ optional: true }) idleTimeout?: number;
    @IsInteger({ optional: true }) maxLifetime?: number;
}

@Schema()
class NamedClusterOptions extends ClusterOptions {
    @IsString() name!: string;
}

@Configuration('kavri.datasource')
class DataSourceOptions extends ClusterOptions {
    /** Additional named data sources. */
    @IsArray(Ref(() => NamedClusterOptions), { optional: true })
    multiSources?: NamedClusterOptions[];
}
```

Config example:

```yaml
kavri:
  datasource:
    dialect: postgres
    driver: drizzle
    host: localhost
    port: 5432
    username: admin
    password: secret
    database: myapp
    maxConnections: 10
    multiSources:
      - name: analytics
        dialect: postgres
        driver: drizzle
        host: analytics-db
        database: analytics
      - name: legacy
        dialect: mysql
        driver: sequelize
        host: legacy-db
        database: legacy
```

## 4. DataSourceDriver

Abstract class. Manages multiple/dynamic data sources. Does NOT manage connection pools — the driver acquires/releases connections in `doBegin`/`commit`/`rollback`.

Subclasses must be `@Component('driverName')`. Found via `injectMap(DataSourceDriver)`.

The base class optionally injects `DataSourceOptions` and provides `getSources()` to filter data sources matching the current driver name.

```ts
abstract class DataSourceDriver<TOptions, TConnection, TPool extends TConnection = TConnection> {
    constructor(private readonly dsOptions = inject(DataSourceOptions, true)) {}

    /**
     * Get data sources from DataSourceOptions that match this driver.
     * Filters by ClusterOptions.driver === this component's name.
     * Includes the root source (if driver matches) and multiSources entries.
     */
    protected getSources(): NamedClusterOptions[];

    /** Register a named data source. Idempotent — only connects once per name. */
    connect(name: Qualifier, options: TOptions): Promise<void>;
    protected abstract doConnect(name: Qualifier, options: TOptions): Awaitable<TPool>;

    /** Check if a data source is registered. */
    has(name: Qualifier): boolean;

    /** Get pool connection (non-transactional). */
    get(name: Qualifier): TPool;

    /** Begin a top-level transaction. Delegates to doBegin after resolving pool. */
    begin(name: Qualifier, options: TransactionOptions): Awaitable<TConnection>;
    protected abstract doBegin(pool: TPool, options: TransactionOptions): Awaitable<TConnection>;

    /** Create a nested transaction (savepoint). */
    abstract child(connection: TConnection, options: TransactionOptions): Awaitable<TConnection>;

    /** Commit a transaction. */
    abstract commit(connection: TConnection): Awaitable<void>;

    /** Rollback a transaction. */
    abstract rollback(connection: TConnection, error: any): Awaitable<void>;

    /** Close a pool connection. */
    abstract close(pool: TPool): Awaitable<void>;

    /** Close all data sources. Called on container destroy. */
    shutdown(): Promise<void>;
}
```

`connect`/`has`/`get`/`begin`/`shutdown`/`getSources` are implemented by the base class. Subclasses implement `doConnect`/`doBegin`/`child`/`commit`/`rollback`/`close`.

## 5. DataSourceResolver

Resolves `driver` and `dataSource` from `DataSourceResolveOptions`. Multiple resolvers can coexist — the first one that returns a result wins. Sorted by `@Priority`.

```ts
interface DataSourceResolution {
    dataSource: Qualifier;
    driver: Qualifier;
}

abstract class DataSourceResolver {
    /**
     * Return resolution or undefined to pass to the next resolver.
     * Must be sync — repositories call getConnection() synchronously.
     */
    abstract resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined;
}
```

### DefaultDataSourceResolver (built-in, lowest priority)

```ts
@Component()
@Priority(10000)
class DefaultDataSourceResolver extends DataSourceResolver {
    /**
     * Default resolution logic (ignores target):
     * - If dataSource not specified, use 'default'
     * - If driver not specified, find the unique driver that has the dataSource.
     *   If multiple drivers have it, throw. If none, return undefined.
     */
    resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined;
}
```

For multi-tenant scenarios, implement a custom resolver at higher priority that reads tenant info from `RequestContext`:

```ts
@Component()
@Priority(1000)
class TenantDataSourceResolver extends DataSourceResolver {
    resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined {
        const tenantId = kTenantId.get();
        if (!tenantId) return undefined;
        return { dataSource: `tenant_${tenantId}`, driver: 'drizzle' };
    }
}

// Interceptor: extract tenant from request, ensure dynamic data source is connected.
const kTenantId = RequestContext.key<string>('tenantId');

@Component()
@Priority(Interceptor.GUARD + 1)
class TenantInterceptor extends Interceptor {
    constructor(
        private readonly driver = inject(DataSourceDriver, 'drizzle'),
    ) {}

    async intercept(next: () => unknown) {
        const req = kRequest.getOrThrow();
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return next();

        kTenantId.set(tenantId);

        // connect() is idempotent — only connects once per name
        const tenantDbUrl = await fetchTenantDbUrl(tenantId);
        await this.driver.connect(`tenant_${tenantId}`, tenantDbUrl);

        return next();
    }
}
```

## 6. Transaction (handle)

Passed to `TransactionManager.begin()` callback. Commit/rollback happen automatically — commit on callback success, rollback on throw. Manual commit/rollback also available. Nested transactions via `tx.begin()`.

```ts
class Transaction {
    /** Begin a nested transaction. Callback receives child Transaction. */
    begin<T>(options: TransactionOptions, fn: (tx: Transaction) => Promise<T>): Promise<T>;
    /** Manual commit (optional — auto-commits if callback succeeds). */
    commit(): Promise<void>;
    /** Manual rollback (optional — auto-rollbacks if callback throws). */
    rollback(error?: any): Promise<void>;
}
```

## 7. TransactionManager

Merges the old `DataSourceManager` role. Manages the ALS-based transaction stack, resolves data sources, and provides connections.

```ts
@Component()
class TransactionManager {
    constructor(
        private readonly drivers = injectMap(DataSourceDriver),
        private readonly resolvers = injectAll(DataSourceResolver, 'priority'),
    ) {}

    /**
     * Begin a transaction. Pushes onto the ALS transaction stack.
     * Callback receives Transaction handle. Auto-commits on success, auto-rollbacks on throw.
     */
    begin<T>(options: TransactionOptions, fn: (tx: Transaction) => Promise<T>): Promise<T>;

    /**
     * Get the current connection for a data source.
     * 1. Resolve target source via resolvers.
     * 2. Check if target source is in the transaction stack → use tx connection.
     * 3. Otherwise, get pool connection from driver.
     *
     * Must be sync — called from Repository.getConnection().
     */
    getConnection<T>(options?: DataSourceResolveOptions): T;

    /** Resolve data source + driver via resolver chain. */
    private resolveSource(options: DataSourceResolveOptions): DataSourceResolution;
}
```

### Pseudocode

```ts
class TransactionManager {
    async begin<T>(options: TransactionOptions, fn: (tx: Transaction) => Promise<T>): Promise<T> {
        const resolution = this.resolveSource(options);
        const driver = this.drivers.get(resolution.driver);
        const propagation = options.propagation ?? Propagation.Required;
        const current = this.findCurrentTransaction(resolution.dataSource);

        switch (propagation) {
            case Propagation.Required:
                if (current) return fn(current.tx); // reuse
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.RequiresNew:
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.Supports:
                if (current) return fn(current.tx);
                return fn(Transaction.NOOP);

            case Propagation.Mandatory:
                if (!current) throw new TransactionError('No existing transaction');
                return fn(current.tx);

            case Propagation.NotSupported:
                return fn(Transaction.NOOP);

            case Propagation.Never:
                if (current) throw new TransactionError('Transaction not allowed');
                return fn(Transaction.NOOP);
        }
    }

    private async executeNew<T>(driver, resolution, options, fn): Promise<T> {
        const conn = await driver.begin(resolution.dataSource, options);
        const frame = { dataSource: resolution.dataSource, driver: resolution.driver, connection: conn, tx: null! };
        const tx = new Transaction(this, driver, frame);
        frame.tx = tx;
        pushFrame(frame);
        try {
            const result = await fn(tx);
            await driver.commit(conn);
            return result;
        } catch (err) {
            await driver.rollback(conn, err);
            throw err;
        } finally {
            popFrame(frame);
        }
    }

    getConnection<T>(options: DataSourceResolveOptions = {}): T {
        const resolution = this.resolveSource(options);
        const frame = this.findCurrentTransaction(resolution.dataSource);
        if (frame) return frame.connection as T;
        const driver = this.drivers.get(resolution.driver)!;
        return driver.get(resolution.dataSource) as T;
    }

    private resolveSource(options: DataSourceResolveOptions): DataSourceResolution {
        if (options.dataSource && options.driver) {
            return { dataSource: options.dataSource, driver: options.driver };
        }
        for (const resolver of this.resolvers) {
            const result = resolver.resolve(options);
            if (result) return result;
        }
        throw new TransactionError('Cannot resolve data source');
    }

    private findCurrentTransaction(dataSource: Qualifier): TransactionFrame | undefined {
        const stack = kTransactionStack.get();
        if (!stack) return undefined;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].dataSource === dataSource) return stack[i];
        }
        return undefined;
    }
}
```

## 8. Drizzle Driver (`@kavri/drizzle`)

```ts
@Component('drizzle')
class DrizzleDataSourceDriver extends DataSourceDriver<NamedClusterOptions, DrizzleTransaction, DrizzleDatabase> {

    @OnConstruct()
    async init() {
        for (const source of this.getSources()) {
            await this.connect(source.name, source);
        }
    }

    protected doConnect(name: Qualifier, options: NamedClusterOptions) {
        const url = `${options.dialect}://${options.username}:${options.password}@${options.host}:${options.port}/${options.database}`;
        return drizzle(url);
    }

    protected async doBegin(pool: DrizzleDatabase, options: TransactionOptions) {
        // Convert Drizzle's callback-based tx API to imperative begin/commit/rollback
        const started = Promise.withResolvers<DrizzleTransaction>();
        const control = Promise.withResolvers<void>();

        const txPromise = pool.transaction(
            { isolationLevel: options.isolation },
            async (tx) => {
                started.resolve(tx);
                return control.promise;
            },
        );
        txPromise.catch(started.reject);

        const tx = await started.promise;
        (tx as any).__control = control;
        (tx as any).__promise = txPromise;
        return tx;
    }

    async child(connection: DrizzleTransaction, options: TransactionOptions) {
        // Nested transaction / savepoint — same pattern on the tx object
        const started = Promise.withResolvers<DrizzleTransaction>();
        const control = Promise.withResolvers<void>();

        const spPromise = (connection as any).transaction(async (sp: any) => {
            started.resolve(sp);
            return control.promise;
        });
        spPromise.catch(started.reject);

        const sp = await started.promise;
        (sp as any).__control = control;
        (sp as any).__promise = spPromise;
        return sp;
    }

    async commit(connection: DrizzleTransaction) {
        (connection as any).__control.resolve();
        await (connection as any).__promise;
    }

    async rollback(connection: DrizzleTransaction, error: any) {
        (connection as any).__control.reject(error);
        await (connection as any).__promise.catch(() => {});
    }

    async close(pool: DrizzleDatabase) {
        // close the underlying connection
    }
}
```

### Drizzle Repository (`@kavri/drizzle`)

```ts
abstract class DrizzleRepository<TRecord> {
    constructor(
        protected readonly table: any,
        protected readonly tm = inject(TransactionManager),
        protected readonly dataSource: Qualifier = 'default',
    ) {}

    protected get conn() {
        return this.tm.getConnection<DrizzleDatabase | DrizzleTransaction>({
            driver: 'drizzle',
            target: this,
            dataSource: this.dataSource,
        });
    }

    async findOne(id: any): Promise<TRecord | undefined> {
        const rows = await this.conn.select().from(this.table).where(eq(this.table.id, id)).limit(1);
        return rows[0];
    }

    async findAll(): Promise<TRecord[]> {
        return this.conn.select().from(this.table);
    }

    async create(data: Partial<TRecord>): Promise<TRecord> {
        const rows = await this.conn.insert(this.table).values(data).returning();
        return rows[0];
    }

    async delete(id: any): Promise<void> {
        await this.conn.delete(this.table).where(eq(this.table.id, id));
    }
}
```

## 9. Sequelize Driver (`@kavri/sequelize`)

```ts
@Component('sequelize')
class SequelizeDataSourceDriver extends DataSourceDriver<NamedClusterOptions, SequelizeTransaction, Sequelize> {

    @OnConstruct()
    async init() {
        for (const source of this.getSources()) {
            await this.connect(source.name, source);
        }
    }

    protected async doConnect(name: Qualifier, options: NamedClusterOptions) {
        const seq = new Sequelize({
            dialect: options.dialect,
            host: options.host,
            port: options.port,
            username: options.username,
            password: options.password,
            database: options.database,
            pool: {
                max: options.maxConnections,
                min: options.minConnections,
                acquire: options.connectionTimeout,
                idle: options.idleTimeout,
            },
        });
        await seq.authenticate();
        return seq;
    }

    protected async doBegin(pool: Sequelize, options: TransactionOptions) {
        return pool.transaction({ isolationLevel: options.isolation });
    }

    async child(connection: SequelizeTransaction, options: TransactionOptions) {
        // Sequelize supports nested transactions (savepoints) natively
        return (connection as any).sequelize.transaction({ transaction: connection });
    }

    async commit(connection: SequelizeTransaction) { await connection.commit(); }
    async rollback(connection: SequelizeTransaction, error: any) { await connection.rollback(); }
    async close(pool: Sequelize) { await pool.close(); }
}
```

### Sequelize Repository (`@kavri/sequelize`)

```ts
abstract class SequelizeRepository<TRecord> {
    constructor(
        protected readonly model: any,  // Sequelize Model class
        protected readonly tm = inject(TransactionManager),
        protected readonly dataSource: Qualifier = 'default',
    ) {}

    protected get conn() {
        return this.tm.getConnection<Sequelize | SequelizeTransaction>({
            driver: 'sequelize',
            target: this,
            dataSource: this.dataSource,
        });
    }

    async findOne(id: any): Promise<TRecord | undefined> {
        return this.model.findByPk(id, { transaction: this.conn });
    }

    async findAll(): Promise<TRecord[]> {
        return this.model.findAll({ transaction: this.conn });
    }

    async create(data: Partial<TRecord>): Promise<TRecord> {
        return this.model.create(data, { transaction: this.conn });
    }

    async delete(id: any): Promise<void> {
        await this.model.destroy({ where: { id }, transaction: this.conn });
    }
}
```

## 10. Application Example

```ts
// --- Repositories ---

@Component()
class UserRepository extends DrizzleRepository<User> {
    constructor() {
        super(userTable);
    }

    async findByEmail(email: string) {
        return this.conn.select().from(userTable).where(eq(userTable.email, email));
    }
}

@Component()
class OrderRepository extends DrizzleRepository<Order> {
    constructor() {
        super(orderTable);
    }
}

// --- Service ---

@Component()
class UserService {
    constructor(
        private readonly userRepo = inject(UserRepository),
        private readonly orderRepo = inject(OrderRepository),
        private readonly tm = inject(TransactionManager),
    ) {}

    @Transactional()
    async createUserWithOrder(name: string, item: string) {
        const user = await this.userRepo.create({ name });
        await this.orderRepo.create({ userId: user.id, item });
        return user;
    }

    // Manual transaction
    async batchImport(users: string[]) {
        await this.tm.begin({ isolation: Isolation.Serializable }, async (tx) => {
            for (const name of users) {
                await this.userRepo.create({ name });
            }
        });
    }

    // Cross-database transaction (explicit data source)
    @Transactional({ dataSource: 'analytics', driver: 'drizzle' })
    async logAnalytics(event: any) {
        // runs on the 'analytics' data source
    }
}
```

```yaml
# config/config.yaml — uses standardized DataSourceOptions
kavri:
  datasource:
    dialect: postgres
    driver: drizzle
    host: localhost
    port: 5432
    username: admin
    password: secret
    database: myapp
    maxConnections: 10
    multiSources:
      - name: analytics
        dialect: postgres
        driver: drizzle
        host: analytics-db
        database: analytics
      - name: legacy
        dialect: mysql
        driver: sequelize
        host: legacy-db
        username: root
        password: secret
        database: legacy
```

## 11. Error Types

```ts
declare class TransactionError extends Error {}
```

## 12. ALS Flow

```
kTransactionStack: Key<TransactionFrame[]>

TransactionManager.begin(options, fn)
  │
  ├─ resolveSource(options) → { dataSource, driver }
  │   └─ walks resolver chain (sorted by @Priority)
  │
  ├─ findCurrentTransaction(dataSource) → existing frame?
  │   └─ Propagation rules decide: reuse / new / error / noop
  │
  ├─ driver.begin(dataSource, options) → connection
  ├─ pushFrame({ dataSource, driver, connection, tx })
  ├─ fn(tx) runs inside ALS context
  │   │
  │   │  any getConnection() call:
  │   │    TransactionManager.getConnection(opts)
  │   │      → resolveSource → findCurrentTransaction
  │   │      → returns tx connection if found, else pool connection
  │   │
  │   │  Nested @Transactional / tm.begin(opts, nestedFn):
  │   │    → Propagation.Required → reuse, call nestedFn(existing tx)
  │   │    → Propagation.RequiresNew → driver.begin() → new frame → nestedFn(new tx)
  │   │
  ├─ fn succeeds → driver.commit(conn) → popFrame()
  └─ fn throws → driver.rollback(conn, err) → popFrame() → rethrow
```

Resolver must be **sync** — `getConnection()` is called synchronously from repositories. For multi-tenant, an interceptor sets up the context (e.g., `kTenantId`) before the handler runs; the resolver reads it synchronously.

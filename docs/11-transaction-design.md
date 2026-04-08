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
    /** Use existing transaction, create new if none. Default. */
    Required = 'required',
    /** Always create a new independent transaction. */
    RequiresNew = 'requires_new',
    /** Create a savepoint within the existing transaction. Create new if none. */
    Nested = 'nested',
    /** Use existing transaction if any, otherwise non-transactional. */
    Supports = 'supports',
    /** Must have existing transaction, throw if none. */
    Mandatory = 'mandatory',
    /** Run non-transactional, suspend existing if any. */
    NotSupported = 'not_supported',
    /** Throw if existing transaction. */
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
        return this.tm.begin(options, () => method.apply(instance, args));
    }
}
```

## 3. DataSourceOptions (standardized config)

Unified data source configuration. Drivers that follow this structure don't need their own config class.

```ts
@Schema()
class InstanceOptions {
    /** Connection URL. If set, takes precedence over individual host/port/... fields. */
    @IsString({ optional: true }) url?: string;
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
    @IsString() dialect!: string;
    @IsString() driver!: string;
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
    @IsArray(Ref(() => NamedClusterOptions), { optional: true })
    multiSources?: NamedClusterOptions[];
}
```

`getSources()` returns `NamedClusterOptions[]`. If the root entry's `name` is missing, it defaults to `'default'`.

Config example:

```yaml
kavri:
  datasource:
    dialect: postgres
    driver: drizzle
    url: postgres://admin:secret@localhost:5432/myapp
    maxConnections: 10
    multiSources:
      - name: analytics
        dialect: postgres
        driver: drizzle
        url: postgres://admin:secret@analytics-db:5432/analytics
      - name: legacy
        dialect: mysql
        driver: sequelize
        url: mysql://root:secret@legacy-db:3306/legacy
```

## 4. DataSourceDriver

Simplified: `<TOptions, TConnection>` only. The driver smooths out the difference between pools and transaction connections internally.

Subclasses must be `@Component('driverName')`. Found via `injectMap(DataSourceDriver)`.

```ts
abstract class DataSourceDriver<TOptions, TConnection> {
    constructor(private readonly dsOptions = inject(DataSourceOptions, true)) {}

    /**
     * Get data sources from DataSourceOptions matching this driver.
     * Filters by ClusterOptions.driver === this component's name.
     * Root entry name defaults to 'default' if missing.
     */
    protected getSources(): NamedClusterOptions[];

    /** Register a named data source. Idempotent — only connects once per name. */
    connect(name: Qualifier, options: TOptions): Promise<void>;
    protected abstract doConnect(name: Qualifier, options: TOptions): Awaitable<void>;

    /** Check if a data source is registered. */
    has(name: Qualifier): boolean;

    /** Get a connection (pool or direct). Used when not in a transaction. */
    abstract get(name: Qualifier): TConnection;

    /** Begin a top-level transaction. */
    abstract begin(name: Qualifier, options: TransactionOptions): Awaitable<TConnection>;

    /** Create a savepoint within an existing transaction. */
    abstract child(connection: TConnection, options: TransactionOptions): Awaitable<TConnection>;

    /** Commit. Can be called multiple times (idempotent after first). */
    abstract commit(connection: TConnection): Awaitable<void>;

    /** Rollback. Can be called multiple times (idempotent after first). */
    abstract rollback(connection: TConnection, error: any): Awaitable<void>;

    /** Close all data sources. Called on container destroy. */
    shutdown(): Promise<void>;
}
```

`connect`/`has`/`shutdown`/`getSources` are implemented by the base class. Subclasses implement `doConnect`/`get`/`begin`/`child`/`commit`/`rollback`.

## 5. DataSourceResolver

Resolves `driver` and `dataSource` from `DataSourceResolveOptions`. Multiple resolvers can coexist — the first one that returns a result wins. Sorted by `@Priority`.

```ts
interface DataSourceResolution {
    dataSource: Qualifier;
    driver: Qualifier;
}

abstract class DataSourceResolver {
    abstract resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined;
}
```

### DefaultDataSourceResolver (built-in, lowest priority)

```ts
@Component()
@Priority(10000)
class DefaultDataSourceResolver extends DataSourceResolver {
    constructor(private readonly drivers = injectMap(DataSourceDriver)) {}

    /**
     * - If dataSource not specified, use 'default'
     * - If driver not specified, find the unique driver that has the dataSource.
     *   If multiple drivers have it, throw. If none, return undefined.
     */
    resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined {
        const dataSource = options.dataSource ?? 'default';
        if (options.driver) return { dataSource, driver: options.driver };

        const matching = [...this.drivers.entries()].filter(([_, d]) => d.has(dataSource));
        if (matching.length === 1) return { dataSource, driver: matching[0][0] };
        if (matching.length > 1) throw new TransactionError(`Multiple drivers for '${String(dataSource)}'`);
        return undefined;
    }
}
```

### Multi-tenant example

```ts
const kTenantId = RequestContext.key<string>('tenantId');

@Component()
@Priority(1000)
class TenantDataSourceResolver extends DataSourceResolver {
    resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined {
        const tenantId = kTenantId.get();
        if (!tenantId) return undefined;
        return { dataSource: `tenant_${tenantId}`, driver: 'drizzle' };
    }
}

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
        const tenantConfig = await fetchTenantConfig(tenantId);
        await this.driver.connect(`tenant_${tenantId}`, {
            name: `tenant_${tenantId}`,
            dialect: 'postgres',
            driver: 'drizzle',
            url: tenantConfig.databaseUrl,
        });

        return next();
    }
}
```

## 6. Transaction (handle)

Passed to `TransactionManager.begin()` callback. Auto-commits on callback success, auto-rollbacks on throw.

Manual `commit()`/`rollback()` can be called inside the callback. They are idempotent — safe to call multiple times. The auto-commit/rollback after the callback checks if already committed/rolled back and skips if so.

```ts
class Transaction {
    /** Manual commit. Idempotent. */
    commit(): Promise<void>;
    /** Manual rollback. Idempotent. */
    rollback(error?: any): Promise<void>;
}
```

`TransactionManager` is the single entry point for beginning transactions. No `Transaction.begin()`.

## 7. TransactionManager

Manages ALS-based transaction stack. If called outside a `RequestContext`, auto-wraps in `RequestContext.run()`.

```ts
const kTransactionStack = RequestContext.key<TransactionFrame[]>('transactionStack');

interface TransactionFrame {
    dataSource: Qualifier;
    driver: Qualifier;
    connection: any;
    committed: boolean;
    rolledBack: boolean;
}

@Component()
class TransactionManager {
    constructor(
        private readonly drivers = injectMap(DataSourceDriver),
        private readonly resolvers = injectAll(DataSourceResolver, 'priority'),
    ) {}

    /**
     * Begin a transaction. Auto-wraps in RequestContext.run() if not active.
     * Auto-commits on fn success. Auto-rollbacks on fn throw.
     */
    begin<T>(options: TransactionOptions, fn: (tx: Transaction) => Promise<T>): Promise<T>;

    /**
     * Get the current connection for a data source.
     * Returns tx connection if in a transaction, otherwise pool connection.
     * Must be sync.
     */
    getConnection<T>(options?: DataSourceResolveOptions): T;

    private resolveSource(options: DataSourceResolveOptions): DataSourceResolution;
    private findCurrentTransaction(dataSource: Qualifier): TransactionFrame | undefined;
}
```

### Pseudocode

```ts
class TransactionManager {
    async begin<T>(options: TransactionOptions, fn: (tx: Transaction) => Promise<T>): Promise<T> {
        // Auto-wrap in RequestContext if not active
        if (!RequestContext.isActive()) {
            return RequestContext.run(() => this.begin(options, fn));
        }

        const resolution = this.resolveSource(options);
        const driver = this.drivers.get(resolution.driver)!;
        const propagation = options.propagation ?? Propagation.Required;
        const current = this.findCurrentTransaction(resolution.dataSource);

        switch (propagation) {
            case Propagation.Required:
                if (current) return fn(new Transaction(current));
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.RequiresNew:
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.Nested:
                if (current) return this.executeChild(driver, current, resolution, options, fn);
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.Supports:
                return fn(current ? new Transaction(current) : Transaction.NOOP);

            case Propagation.Mandatory:
                if (!current) throw new TransactionError('No existing transaction');
                return fn(new Transaction(current));

            case Propagation.NotSupported:
                return fn(Transaction.NOOP);

            case Propagation.Never:
                if (current) throw new TransactionError('Transaction not allowed');
                return fn(Transaction.NOOP);
        }
    }

    private async executeNew<T>(driver, resolution, options, fn): Promise<T> {
        const conn = await driver.begin(resolution.dataSource, options);
        const frame: TransactionFrame = {
            dataSource: resolution.dataSource,
            driver: resolution.driver,
            connection: conn,
            committed: false,
            rolledBack: false,
        };
        this.pushFrame(frame);
        try {
            const result = await fn(new Transaction(frame));
            if (!frame.committed && !frame.rolledBack) {
                await driver.commit(conn);
                frame.committed = true;
            }
            return result;
        } catch (err) {
            if (!frame.rolledBack) {
                await driver.rollback(conn, err);
                frame.rolledBack = true;
            }
            throw err;
        } finally {
            this.popFrame(frame);
        }
    }

    private async executeChild<T>(driver, parent, resolution, options, fn): Promise<T> {
        const childConn = await driver.child(parent.connection, options);
        const frame: TransactionFrame = {
            dataSource: resolution.dataSource,
            driver: resolution.driver,
            connection: childConn,
            committed: false,
            rolledBack: false,
        };
        this.pushFrame(frame);
        try {
            const result = await fn(new Transaction(frame));
            if (!frame.committed && !frame.rolledBack) {
                await driver.commit(childConn);
                frame.committed = true;
            }
            return result;
        } catch (err) {
            if (!frame.rolledBack) {
                await driver.rollback(childConn, err);
                frame.rolledBack = true;
            }
            throw err;
        } finally {
            this.popFrame(frame);
        }
    }

    getConnection<T>(options: DataSourceResolveOptions = {}): T {
        const resolution = this.resolveSource(options);
        const frame = this.findCurrentTransaction(resolution.dataSource);
        if (frame) return frame.connection as T;
        return this.drivers.get(resolution.driver)!.get(resolution.dataSource) as T;
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

    private pushFrame(frame: TransactionFrame) {
        kTransactionStack.getOrInsertComputed(() => []).push(frame);
    }

    private popFrame(frame: TransactionFrame) {
        const stack = kTransactionStack.get();
        if (stack) {
            const idx = stack.indexOf(frame);
            if (idx >= 0) stack.splice(idx, 1);
        }
    }
}
```

## 8. Drizzle Driver (`@kavri/drizzle`)

Drizzle uses `db` (pool) and `tx` (transaction) interchangeably for queries — same interface. The driver smooths them into a single `TConnection` type.

```ts
// Drizzle's db and tx share this interface
type DrizzleConnection = DrizzleDatabase | DrizzleTransaction;

@Component('drizzle')
class DrizzleDataSourceDriver extends DataSourceDriver<NamedClusterOptions, DrizzleConnection> {
    private pools = new Map<Qualifier, DrizzleDatabase>();

    @OnConstruct()
    async init() {
        for (const source of this.getSources()) {
            await this.connect(source.name, source);
        }
    }

    protected doConnect(name: Qualifier, options: NamedClusterOptions) {
        const url = options.url ?? `${options.dialect}://${options.username}:${options.password}@${options.host}:${options.port}/${options.database}`;
        this.pools.set(name, drizzle(url));
    }

    get(name: Qualifier): DrizzleConnection {
        const db = this.pools.get(name);
        if (!db) throw new Error(`Data source not found: ${String(name)}`);
        return db;
    }

    async begin(name: Qualifier, options: TransactionOptions): Promise<DrizzleConnection> {
        const pool = this.pools.get(name)!;
        const started = Promise.withResolvers<DrizzleTransaction>();
        const control = Promise.withResolvers<void>();

        const txPromise = pool.transaction(
            { isolationLevel: options.isolation },
            async (tx) => { started.resolve(tx); return control.promise; },
        );
        txPromise.catch(started.reject);

        const tx = await started.promise;
        (tx as any).__control = control;
        (tx as any).__promise = txPromise;
        return tx;
    }

    async child(connection: DrizzleConnection, options: TransactionOptions): Promise<DrizzleConnection> {
        const started = Promise.withResolvers<DrizzleTransaction>();
        const control = Promise.withResolvers<void>();

        const spPromise = (connection as any).transaction(async (sp: any) => {
            started.resolve(sp); return control.promise;
        });
        spPromise.catch(started.reject);

        const sp = await started.promise;
        (sp as any).__control = control;
        (sp as any).__promise = spPromise;
        return sp;
    }

    async commit(connection: DrizzleConnection) {
        const ctrl = (connection as any).__control;
        if (ctrl) { ctrl.resolve(); await (connection as any).__promise; }
    }

    async rollback(connection: DrizzleConnection, error: any) {
        const ctrl = (connection as any).__control;
        if (ctrl) { ctrl.reject(error); await (connection as any).__promise.catch(() => {}); }
    }

    async shutdown() {
        for (const pool of this.pools.values()) {
            // close pool
        }
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

    protected get conn(): DrizzleConnection {
        return this.tm.getConnection<DrizzleConnection>({
            driver: 'drizzle', target: this, dataSource: this.dataSource,
        });
    }

    async findOne(id: any): Promise<TRecord | undefined> {
        const rows = await this.conn.select().from(this.table).where(eq(this.table.id, id)).limit(1);
        return rows[0];
    }

    async findAll(): Promise<TRecord[]> { return this.conn.select().from(this.table); }

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

Sequelize uses a `Sequelize` instance for pool and `Transaction` as an option. The driver returns `Transaction | undefined` as the connection — `undefined` means non-transactional.

```ts
type SequelizeConnection = SequelizeTransaction | undefined;

@Component('sequelize')
class SequelizeDataSourceDriver extends DataSourceDriver<NamedClusterOptions, SequelizeConnection> {
    private instances = new Map<Qualifier, Sequelize>();

    @OnConstruct()
    async init() {
        for (const source of this.getSources()) {
            await this.connect(source.name, source);
        }
    }

    protected async doConnect(name: Qualifier, options: NamedClusterOptions) {
        const url = options.url ?? `${options.dialect}://${options.username}:${options.password}@${options.host}:${options.port}/${options.database}`;
        const seq = new Sequelize(url, {
            pool: {
                max: options.maxConnections,
                min: options.minConnections,
                acquire: options.connectionTimeout,
                idle: options.idleTimeout,
            },
        });
        await seq.authenticate();
        this.instances.set(name, seq);
    }

    /** Returns undefined — Sequelize doesn't use connections directly for queries. */
    get(name: Qualifier): SequelizeConnection {
        return undefined;
    }

    async begin(name: Qualifier, options: TransactionOptions): Promise<SequelizeConnection> {
        const seq = this.instances.get(name)!;
        return seq.transaction({ isolationLevel: options.isolation });
    }

    async child(connection: SequelizeConnection, options: TransactionOptions): Promise<SequelizeConnection> {
        // Sequelize savepoints via nested transaction
        return (connection as any).sequelize.transaction({ transaction: connection });
    }

    async commit(connection: SequelizeConnection) {
        if (connection) await connection.commit();
    }

    async rollback(connection: SequelizeConnection, error: any) {
        if (connection) await connection.rollback();
    }

    /** Get the Sequelize instance for a data source (needed by models). */
    getInstance(name: Qualifier): Sequelize {
        return this.instances.get(name)!;
    }

    async shutdown() {
        for (const seq of this.instances.values()) {
            await seq.close();
        }
    }
}
```

### Sequelize Repository (`@kavri/sequelize`)

The connection is `Transaction | undefined` — passed as `{ transaction }` option to model queries.

```ts
abstract class SequelizeRepository<TRecord> {
    constructor(
        protected readonly model: any,
        protected readonly tm = inject(TransactionManager),
        protected readonly dataSource: Qualifier = 'default',
    ) {}

    protected get transaction(): SequelizeTransaction | undefined {
        return this.tm.getConnection<SequelizeConnection>({
            driver: 'sequelize', target: this, dataSource: this.dataSource,
        });
    }

    async findOne(id: any): Promise<TRecord | undefined> {
        return this.model.findByPk(id, { transaction: this.transaction });
    }

    async findAll(): Promise<TRecord[]> {
        return this.model.findAll({ transaction: this.transaction });
    }

    async create(data: Partial<TRecord>): Promise<TRecord> {
        return this.model.create(data, { transaction: this.transaction });
    }

    async delete(id: any): Promise<void> {
        await this.model.destroy({ where: { id }, transaction: this.transaction });
    }
}
```

## 10. Application Example

```ts
@Component()
class UserRepository extends DrizzleRepository<User> {
    constructor() { super(userTable); }

    async findByEmail(email: string) {
        return this.conn.select().from(userTable).where(eq(userTable.email, email));
    }
}

@Component()
class UserService {
    constructor(
        private readonly userRepo = inject(UserRepository),
        private readonly tm = inject(TransactionManager),
    ) {}

    @Transactional()
    async createUserWithOrder(name: string) {
        await this.userRepo.create({ name });
    }

    // Manual transaction
    async batchImport(users: string[]) {
        await this.tm.begin({ isolation: Isolation.Serializable }, async () => {
            for (const name of users) {
                await this.userRepo.create({ name });
            }
        });
    }

    // Nested savepoint
    async importWithRetry(name: string) {
        await this.tm.begin({}, async () => {
            try {
                await this.tm.begin({ propagation: Propagation.Nested }, async () => {
                    await this.userRepo.create({ name });
                });
            } catch {
                // savepoint rolled back, outer tx continues
                await this.userRepo.create({ name: name + '_fallback' });
            }
        });
    }
}
```

```yaml
kavri:
  datasource:
    dialect: postgres
    driver: drizzle
    url: postgres://admin:secret@localhost:5432/myapp
    multiSources:
      - name: analytics
        dialect: postgres
        driver: drizzle
        url: postgres://admin:secret@analytics-db:5432/analytics
      - name: legacy
        dialect: mysql
        driver: sequelize
        url: mysql://root:secret@legacy-db:3306/legacy
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
  ├─ if !RequestContext.isActive() → RequestContext.run(() => begin(options, fn))
  │
  ├─ resolveSource(options) → { dataSource, driver }
  ├─ findCurrentTransaction(dataSource) → existing frame?
  │   └─ Propagation rules:
  │       Required → reuse / executeNew
  │       RequiresNew → executeNew (independent)
  │       Nested → executeChild (savepoint) / executeNew
  │       Supports → reuse / NOOP
  │       Mandatory → reuse / throw
  │       NotSupported → NOOP
  │       Never → throw / NOOP
  │
  ├─ executeNew: driver.begin() → push frame → fn(tx) → commit/rollback → pop
  ├─ executeChild: driver.child() → push frame → fn(tx) → commit/rollback → pop
  │
  │  Inside fn — any getConnection() call:
  │    resolveSource → findCurrentTransaction → return tx connection or pool
  │
  │  Auto-commit/rollback checks frame.committed/rolledBack flags
  │  (safe with manual commit/rollback — idempotent)
  │
  └─ Result bubbles up
```

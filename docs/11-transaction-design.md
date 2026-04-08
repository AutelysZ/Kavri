# Transaction Design

Transaction management in `@kavri/web`. AOP mechanism in `@kavri/container` (see [01-container-design.md](./01-container-design.md#10-aop)).
ORM drivers: `@kavri/drizzle`, `@kavri/sequelize`.

## 1. Transaction Types (`@kavri/web`)

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

interface TransactionOptions {
    isolation?: Isolation;
    propagation?: Propagation;
    timeout?: number;
    /** Named data source. Resolved by DataSourceResolver if omitted. */
    dataSource?: Qualifier;
    /** Named driver. Resolved by DataSourceResolver if omitted. */
    driver?: Qualifier;
}
```

## 2. @Transactional

```ts
declare function Transactional(options?: TransactionOptions): AspectMethodDecorator<TransactionOptions>;

@Component()
class TransactionalAspect extends MethodAspect<TransactionOptions> {
    constructor(private readonly txManager = inject(TransactionManager)) {}

    around(metadata: TransactionOptions, instance: any, method: Function, args: any[]) {
        return this.txManager.begin(metadata, () => method.apply(instance, args));
    }
}
```

## 3. Data Source Abstraction

### DataSourceDriver (interface, lives in each ORM package)

Each driver is `@Component('driverName')`. Found via `injectMap(DataSourceDriver)`.

```ts
abstract class DataSourceDriver<TConnection = any> {
    /** Ensure a data source exists. Create if needed (dynamic/multi-tenant). */
    ensure(dataSource: Qualifier, connectionOptions: any): Awaitable<void>;

    /** Get a non-transactional connection. */
    get(dataSource: Qualifier): TConnection;

    /** Begin a top-level transaction. */
    begin(dataSource: Qualifier, options: TransactionOptions): Awaitable<TConnection>;

    /** Create a nested transaction (savepoint). */
    child(connection: TConnection, options: TransactionOptions): Awaitable<TConnection>;

    /** Commit. */
    commit(connection: TConnection): Awaitable<void>;

    /** Rollback. */
    rollback(connection: TConnection, error: any): Awaitable<void>;
}
```

### DataSourceResolver

Resolves data source, driver name, and connection options at runtime (e.g., multi-tenant).

```ts
interface DataSourceResolution {
    dataSource: Qualifier;
    driver: Qualifier;
    connectionOptions?: any;
}

abstract class DataSourceResolver {
    abstract resolve(): Awaitable<DataSourceResolution>;
}
```

When `TransactionOptions.dataSource` and `TransactionOptions.driver` are omitted, `TransactionManager` consults `DataSourceResolver`.

### DataSourceManager

Coordinates drivers. Manages the ALS-based transaction/connection stack.

```ts
// ALS keys
const kTransactionStack = RequestContext.key<TransactionFrame[]>('transactionStack');

interface TransactionFrame {
    dataSource: Qualifier;
    driver: Qualifier;
    connection: any;
    options: TransactionOptions;
}

@Component()
class DataSourceManager {
    constructor(
        private readonly drivers = injectMap(DataSourceDriver),
        private readonly resolver = inject(DataSourceResolver, true),
    ) {}

    /** Get driver by name. */
    getDriver(driver: Qualifier): DataSourceDriver {
        const d = this.drivers.get(driver);
        if (!d) throw new Error(`No driver: ${String(driver)}`);
        return d;
    }

    /** Resolve data source + driver. Uses explicit values or falls back to resolver. */
    async resolveSource(options: TransactionOptions): Promise<DataSourceResolution> {
        if (options.dataSource && options.driver) {
            return { dataSource: options.dataSource, driver: options.driver };
        }
        if (!this.resolver) throw new Error('No DataSourceResolver and no explicit dataSource/driver');
        const resolved = await this.resolver.resolve();
        return {
            dataSource: options.dataSource ?? resolved.dataSource,
            driver: options.driver ?? resolved.driver,
            connectionOptions: resolved.connectionOptions,
        };
    }

    /** Ensure data source exists (for dynamic cases). */
    async ensureSource(resolution: DataSourceResolution): Promise<void> {
        if (resolution.connectionOptions) {
            const driver = this.getDriver(resolution.driver);
            await driver.ensure(resolution.dataSource, resolution.connectionOptions);
        }
    }

    /**
     * Get the current connection for a data source.
     * Checks transaction stack first, falls back to non-transactional.
     */
    getConnection<T>(dataSource: Qualifier, driver: Qualifier): T {
        const stack = kTransactionStack.get();
        if (stack) {
            // Find the topmost frame for this data source
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].dataSource === dataSource) {
                    return stack[i].connection as T;
                }
            }
        }
        return this.getDriver(driver).get(dataSource) as T;
    }

    /** Push a transaction frame onto the stack. */
    pushFrame(frame: TransactionFrame): void {
        const stack = kTransactionStack.getOrInsertComputed(() => []);
        stack.push(frame);
    }

    /** Pop the topmost frame. */
    popFrame(): void {
        const stack = kTransactionStack.get();
        if (stack) stack.pop();
    }
}
```

## 4. TransactionManager

Manages transaction lifecycle using ALS-based transaction stack.

```ts
@Component()
class TransactionManager {
    constructor(private readonly dsm = inject(DataSourceManager)) {}

    async begin<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T> {
        const propagation = options.propagation ?? Propagation.Required;
        const resolution = await this.dsm.resolveSource(options);
        await this.dsm.ensureSource(resolution);

        const driver = this.dsm.getDriver(resolution.driver);
        const stack = kTransactionStack.get();
        const currentFrame = stack?.findLast(f => f.dataSource === resolution.dataSource);

        switch (propagation) {
            case Propagation.Required:
                if (currentFrame) return fn();
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.RequiresNew:
                if (currentFrame) return this.executeNested(driver, currentFrame, resolution, options, fn);
                return this.executeNew(driver, resolution, options, fn);

            case Propagation.Supports:
                return fn();

            case Propagation.Mandatory:
                if (!currentFrame) throw new TransactionError('No existing transaction');
                return fn();

            case Propagation.NotSupported:
                // Temporarily remove all frames for this data source
                return this.executeSuspended(resolution.dataSource, fn);

            case Propagation.Never:
                if (currentFrame) throw new TransactionError('Transaction not allowed');
                return fn();
        }
    }

    private async executeNew<T>(
        driver: DataSourceDriver,
        resolution: DataSourceResolution,
        options: TransactionOptions,
        fn: () => Promise<T>,
    ): Promise<T> {
        const conn = await driver.begin(resolution.dataSource, options);
        const frame: TransactionFrame = {
            dataSource: resolution.dataSource,
            driver: resolution.driver,
            connection: conn,
            options,
        };
        this.dsm.pushFrame(frame);
        try {
            const result = await this.withTimeout(options.timeout, fn);
            await driver.commit(conn);
            return result;
        } catch (err) {
            await driver.rollback(conn, err);
            throw err;
        } finally {
            this.dsm.popFrame();
        }
    }

    private async executeNested<T>(
        driver: DataSourceDriver,
        parent: TransactionFrame,
        resolution: DataSourceResolution,
        options: TransactionOptions,
        fn: () => Promise<T>,
    ): Promise<T> {
        const childConn = await driver.child(parent.connection, options);
        const frame: TransactionFrame = {
            dataSource: resolution.dataSource,
            driver: resolution.driver,
            connection: childConn,
            options,
        };
        this.dsm.pushFrame(frame);
        try {
            const result = await this.withTimeout(options.timeout, fn);
            await driver.commit(childConn);
            return result;
        } catch (err) {
            await driver.rollback(childConn, err);
            throw err;
        } finally {
            this.dsm.popFrame();
        }
    }

    private async executeSuspended<T>(dataSource: Qualifier, fn: () => Promise<T>): Promise<T> {
        const stack = kTransactionStack.get() ?? [];
        const suspended = stack.filter(f => f.dataSource === dataSource);
        const remaining = stack.filter(f => f.dataSource !== dataSource);
        kTransactionStack.set(remaining);
        try {
            return await fn();
        } finally {
            kTransactionStack.set([...remaining, ...suspended]);
        }
    }

    private async withTimeout<T>(timeout: number | undefined, fn: () => Promise<T>): Promise<T> {
        if (!timeout) return fn();
        return Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new TransactionError('Transaction timeout')), timeout)
            ),
        ]);
    }
}
```

## 5. Drizzle Driver (`@kavri/drizzle`)

```ts
@Configuration('kavri.drizzle')
class DrizzleOptions {
    @IsString() url!: string;
    @IsString({ default: 'default' }) dataSource!: string;
}

@Component('drizzle')
class DrizzleDataSourceDriver extends DataSourceDriver {
    private databases = new Map<Qualifier, DrizzleDatabase>();

    @OnConstruct()
    async init(config = injectConfig(DrizzleOptions)) {
        const db = drizzle(config.url);
        this.databases.set(config.dataSource, db);
    }

    ensure(dataSource: Qualifier, connectionOptions: any) {
        if (!this.databases.has(dataSource)) {
            this.databases.set(dataSource, drizzle(connectionOptions.url));
        }
    }

    get(dataSource: Qualifier) {
        const db = this.databases.get(dataSource);
        if (!db) throw new Error(`Data source not found: ${String(dataSource)}`);
        return db;
    }

    async begin(dataSource: Qualifier, options: TransactionOptions) {
        const db = this.get(dataSource);
        const started = Promise.withResolvers<any>();
        const control = Promise.withResolvers<void>();

        const txPromise = db.transaction(
            { isolationLevel: options.isolation },
            async (tx) => {
                started.resolve(tx);
                return control.promise;
            },
        );
        txPromise.catch(started.reject);

        const tx = await started.promise;
        tx.__control = control;
        tx.__promise = txPromise;
        return tx;
    }

    async child(connection: any, options: TransactionOptions) {
        // Drizzle savepoint — same pattern on the tx object
        const started = Promise.withResolvers<any>();
        const control = Promise.withResolvers<void>();

        const spPromise = connection.transaction(async (sp: any) => {
            started.resolve(sp);
            return control.promise;
        });
        spPromise.catch(started.reject);

        const sp = await started.promise;
        sp.__control = control;
        sp.__promise = spPromise;
        return sp;
    }

    async commit(connection: any) {
        connection.__control.resolve();
        await connection.__promise;
    }

    async rollback(connection: any, error: any) {
        connection.__control.reject(error);
        await connection.__promise.catch(() => {});
    }
}
```

## 6. Drizzle Repository (`@kavri/drizzle`)

Repository knows only the data source name. The driver is resolved automatically.

```ts
abstract class DrizzleRepository<TRecord> {
    constructor(
        protected readonly dsm = inject(DataSourceManager),
        protected readonly table: any,
        protected readonly dataSource: Qualifier = 'default',
        protected readonly driverName: Qualifier = 'drizzle',
    ) {}

    protected getConnection() {
        return this.dsm.getConnection(this.dataSource, this.driverName);
    }

    async findOne(id: any): Promise<TRecord | undefined> {
        const conn = this.getConnection();
        const rows = await conn.select().from(this.table).where(eq(this.table.id, id)).limit(1);
        return rows[0];
    }

    async findAll(): Promise<TRecord[]> {
        return this.getConnection().select().from(this.table);
    }

    async create(data: Partial<TRecord>): Promise<TRecord> {
        const rows = await this.getConnection().insert(this.table).values(data).returning();
        return rows[0];
    }

    async delete(id: any): Promise<void> {
        await this.getConnection().delete(this.table).where(eq(this.table.id, id));
    }
}
```

### Application usage

```ts
@Component()
class UserRepository extends DrizzleRepository<User> {
    constructor() {
        super(inject(DataSourceManager), userTable);
    }

    async findByEmail(email: string) {
        return this.getConnection()
            .select().from(userTable)
            .where(eq(userTable.email, email));
    }
}

@Component()
class UserService {
    constructor(
        private readonly userRepo = inject(UserRepository),
        private readonly orderRepo = inject(OrderRepository),
    ) {}

    @Transactional()
    async createUserWithOrder(name: string) {
        const user = await this.userRepo.create({ name });
        await this.orderRepo.create({ userId: user.id });
        return user;
    }

    @Transactional({ propagation: Propagation.RequiresNew, dataSource: 'analytics', driver: 'drizzle' })
    async logAnalytics(event: any) {
        // runs in a separate transaction on the 'analytics' data source
    }
}
```

## 7. Sequelize Driver (`@kavri/sequelize`)

```ts
@Component('sequelize')
class SequelizeDataSourceDriver extends DataSourceDriver {
    private instances = new Map<Qualifier, Sequelize>();

    @OnConstruct()
    async init(config = injectConfig(SequelizeOptions)) {
        const seq = new Sequelize(config.url);
        await seq.authenticate();
        this.instances.set(config.dataSource, seq);
    }

    ensure(dataSource: Qualifier, connectionOptions: any) {
        if (!this.instances.has(dataSource)) {
            this.instances.set(dataSource, new Sequelize(connectionOptions.url));
        }
    }

    get(dataSource: Qualifier) { return this.instances.get(dataSource)!; }

    async begin(dataSource: Qualifier, options: TransactionOptions) {
        return this.get(dataSource).transaction({ isolationLevel: options.isolation });
    }

    async child(connection: any, options: TransactionOptions) {
        return this.get(connection.__dataSource).transaction({ transaction: connection });
    }

    async commit(connection: any) { await connection.commit(); }
    async rollback(connection: any, error: any) { await connection.rollback(); }
}
```

## 8. Error Types

```ts
declare class TransactionError extends Error {}
```

## 9. ALS Flow Summary

The entire transaction system is built on `AsyncLocalStorage` via `RequestContext`:

```
kTransactionStack: Key<TransactionFrame[]>

TransactionManager.begin()
  │
  ├─ resolveSource() → { dataSource, driver, connectionOptions }
  ├─ ensureSource() → driver.ensure() if dynamic
  ├─ driver.begin() → connection
  ├─ pushFrame({ dataSource, driver, connection, options })
  │
  │  fn() runs — any code can call:
  │    DataSourceManager.getConnection(dataSource, driver)
  │      → checks kTransactionStack for matching frame
  │      → returns transaction connection if found
  │      → falls back to driver.get() if not
  │
  │  Nested @Transactional:
  │    TransactionManager.begin() again
  │      → finds existing frame → Propagation rules decide
  │      → RequiresNew → driver.child() → pushFrame()
  │      → Required → reuse existing, just call fn()
  │
  ├─ driver.commit() or driver.rollback()
  └─ popFrame()
```

Works both inside web requests (`RequestContext.run()` already active) and outside (CLI, workers — `RequestContext.run()` is called implicitly by `TransactionManager`).

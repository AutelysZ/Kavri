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

    async around(metadata: TransactionOptions, instance: any, method: Function, args: any[]) {
        const options = metadata.target ? metadata : { ...metadata, target: instance };
        const tx = await this.tm.begin(options);
        try {
            const result = await method.apply(instance, args);
            await tx.commit();
            return result;
        } catch (err) {
            await tx.rollback(err);
            throw err;
        }
    }
}
```

## 3. DataSourceDriver

Abstract class. Manages multiple/dynamic data sources internally. Does NOT manage connection pools — the driver acquires/releases connections in `doBegin`/`commit`/`rollback`.

Subclasses must be `@Component('driverName')`. Found via `injectMap(DataSourceDriver)`.

```ts
abstract class DataSourceDriver<TOptions, TConnection, TPool extends TConnection = TConnection> {
    /** Register a named data source. Called during init or dynamically. */
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

`connect`/`has`/`get`/`begin`/`shutdown` are implemented by the base class (manages the internal name→pool map). Subclasses implement `doConnect`/`doBegin`/`child`/`commit`/`rollback`/`close`.

## 4. DataSourceResolver

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
```

## 5. Transaction (handle)

Returned by `TransactionManager.begin()`. Not callback-style — imperative begin/commit/rollback.

```ts
class Transaction {
    /** Begin a nested transaction (respects propagation). */
    begin(options?: TransactionOptions): Promise<Transaction>;
    /** Commit. */
    commit(): Promise<void>;
    /** Rollback. */
    rollback(error?: any): Promise<void>;
}
```

## 6. TransactionManager

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
     * Returns a Transaction handle for commit/rollback.
     */
    begin(options?: TransactionOptions): Promise<Transaction>;

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
    begin(options: TransactionOptions = {}): Promise<Transaction> {
        const resolution = this.resolveSource(options);
        const driver = this.drivers.get(resolution.driver);
        const propagation = options.propagation ?? Propagation.Required;
        const current = this.findCurrentTransaction(resolution.dataSource);

        switch (propagation) {
            case Propagation.Required:
                if (current) return current; // reuse
                return this.beginNew(driver, resolution, options);

            case Propagation.RequiresNew:
                return this.beginNew(driver, resolution, options);
                // Note: if current exists, new tx is independent

            case Propagation.Supports:
                if (current) return current;
                return Transaction.NOOP; // no-op transaction

            case Propagation.Mandatory:
                if (!current) throw new TransactionError('No existing transaction');
                return current;

            case Propagation.NotSupported:
                return Transaction.NOOP;

            case Propagation.Never:
                if (current) throw new TransactionError('Transaction not allowed');
                return Transaction.NOOP;
        }
    }

    private async beginNew(driver, resolution, options): Promise<Transaction> {
        const conn = await driver.begin(resolution.dataSource, options);
        const frame = { dataSource: resolution.dataSource, driver: resolution.driver, connection: conn };
        pushFrame(frame); // push onto ALS stack
        return new Transaction(driver, frame, () => popFrame(frame));
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

## 7. Example Driver

```ts
@Component('my')
class MyDriver extends DataSourceDriver<string, { query(sql: string): any }> {
    private dataSources: Record<string, string> = {}; // from config

    protected doConnect(name: Qualifier, options: string) {
        return { query(sql: string) { return 'my:' + sql; } };
    }

    protected doBegin(pool: { query(sql: string): any }, options: TransactionOptions) {
        pool.query('BEGIN');
        return pool;
    }

    child(connection: { query(sql: string): any }, options: TransactionOptions) {
        connection.query('SAVEPOINT');
        return connection;
    }

    commit(connection: { query(sql: string): any }) { connection.query('COMMIT'); }
    rollback(connection: { query(sql: string): any }, error: any) { connection.query('ROLLBACK'); }
    close(connection: { query(sql: string): any }) {}

    @OnConstruct()
    async init() {
        for (const [k, v] of Object.entries(this.dataSources)) {
            await this.connect(k, v);
        }
    }
}
```

## 8. Example Repository

```ts
@Component()
class MyRepository {
    constructor(
        private readonly table: string,
        private readonly tm = inject(TransactionManager),
        private readonly dataSource?: string,
    ) {}

    protected get conn() {
        return this.tm.getConnection<{ query(sql: string): any }>({
            driver: 'my',
            target: this,
            dataSource: this.dataSource,
        });
    }

    findOne(id: string) {
        return this.conn.query(`select * from ${this.table} where id = ${id}`);
    }
}
```

## 9. Example Application

```ts
@Component()
class UserRepository extends MyRepository {
    constructor() {
        super('user');
    }

    async createUser(name: string) {
        return this.conn.query(`insert into user (name) values (${name})`);
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
        await this.userRepo.createUser(name);
        // other repo calls — all share the same transaction
    }

    // Manual transaction (imperative, no callback)
    async batchImport(users: string[]) {
        const tx = await this.tm.begin({ isolation: Isolation.Serializable });
        try {
            for (const name of users) {
                await this.userRepo.createUser(name);
            }
            await tx.commit();
        } catch (err) {
            await tx.rollback(err);
            throw err;
        }
    }
}
```

## 10. Error Types

```ts
declare class TransactionError extends Error {}
```

## 11. ALS Flow

```
kTransactionStack: Key<TransactionFrame[]>

TransactionManager.begin(options)
  │
  ├─ resolveSource(options) → { dataSource, driver }
  │   └─ walks resolver chain (sorted by @Priority)
  │
  ├─ findCurrentTransaction(dataSource) → existing frame?
  │   └─ Propagation rules decide: reuse / new / error / noop
  │
  ├─ driver.begin(dataSource, options) → connection
  ├─ pushFrame({ dataSource, driver, connection })
  └─ return Transaction handle
     │
     │  fn() runs — any getConnection() call:
     │    TransactionManager.getConnection(opts)
     │      → resolveSource → findCurrentTransaction
     │      → returns tx connection if found, else pool connection
     │
     │  Nested @Transactional / tm.begin():
     │    → Propagation.Required → reuse existing Transaction
     │    → Propagation.RequiresNew → driver.begin() → new frame
     │
     ├─ tx.commit() → driver.commit(conn) → popFrame()
     └─ tx.rollback(err) → driver.rollback(conn, err) → popFrame()
```

Resolver must be **sync** — `getConnection()` is called synchronously from repositories. For multi-tenant, an interceptor sets up the context (e.g., `kTenantId`) before the handler runs; the resolver reads it synchronously.

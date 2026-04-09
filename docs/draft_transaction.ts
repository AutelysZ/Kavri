/*
 * @since 2026-04-08 12:49:03
 * @author acrazing <joking.young@gmail.com>
 */

import {Qualifier, Awaitable, AnyConstructor, Configuration, Priority, Component, OnConstruct, inject} from './draft'

enum Isolation {
    // ...
}
enum Propagation {
    // ...
}

interface DataSourceResolveOptions {
    driver?: Qualifier;
    dataSource?: Qualifier;
    target?: AnyConstructor<any> | object;
}

interface TransactionOptions extends DataSourceResolveOptions {
    isolation?: Isolation;
    propagation?: Propagation;
    timeout?: number;
}

// the base driver should implement a few multiple/dynamic source management feature by itself.
// DataSourceDriver helps manage the multiple/dnyamic data sources, but don't help with
// manage the connection pool. the driver need to acquire/release the connection when
// doBegin/commit/rollback.
abstract class DataSourceDriver<TOptions, TConnection, TPool extends TConnection = TConnection> {
    constructor(private readonly options = inject(DataSourceOptions, true)) {}
    // automatically filter current driver's data sources
    protected getSources(): NamedClusterOptions[];
    connect(name: Qualifier, options: TOptions): Promise<void>;
    protected abstract doConnect(name: Qualifier, options: TOptions): Awaitable<TPool>;
    has(name: Qualifier): boolean;
    get(name: Qualifier): TPool;
    begin(name: Qualifier, options: TransactionOptions): Awaitable<TConnection>;
    protected abstract doBegin(pool: TPool, options: TransactionOptions): Awaitable<TConnection>;
    abstract child(connection: TConnection, options: TransactionOptions): Awaitable<TConnection>;
    abstract commit(connection: TConnection): Awaitable<void>;
    abstract rollback(connection: TConnection, error: any): Awaitable<void>;
    abstract close(connection: TPool): Awaitable<void>;
    // close all data sources
    shutdown(): Promise<void>;
}

interface DataSourceResolution {
    dataSource: Qualifier;
    driver: Qualifier;
}

abstract class DataSourceResolver {
    /**
     * TransactionManager will look up the data source with all DataSourceResolver
     * if any one resolver returns not undefined, will use it.
     * @param options
     */
    abstract resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined;
}

// lowest priority
@Priority(10000)
declare class DefaultDataSourceResolver extends DataSourceResolver{
    /**
     * builtin default resolver, ignore target
     * if not specify dataSource, use "default"
     * if not specify driver, check if only one driver has specified dataSource
     *      if yes, use it, else if multiple throw error, else return void 0.
     * This method needs to be sync. As the repository needs to access it without
     * promise. So, we need an interceptor to set up the context for multi-tenant
     * scenario. See example.
     * @param options
     */
    resolve(options: DataSourceResolveOptions): DataSourceResolution | undefined
}

declare class Transaction {
    begin(options: TransactionOptions): Promise<Transaction>;
    commit(): Promise<void>
    rollback(error: any): Promise<void>;
}

// merge DataSourceManager into TransactionManager
declare class TransactionManager {
    // don't use callback style
    begin(options: TransactionOptions): Promise<Transaction>;

    /**
     * This method will:
     * 1. resolve the target source
     * 2. check if target source in the transactions stack
     *      if yes, use it
     *      else, get a pool connection
     * @param options
     */
    getConnection<T>(options: DataSourceResolveOptions): T;
}

// example driver

@Component('my')
class MyDriver extends DataSourceDriver<DataSourceOptions, {query(sql: string): any}> {
    protected doConnect(name: Qualifier, options: DataSourceOptions): Awaitable<{query(sql: string): any}> {
        return {query(sql: string) {return 'my:' + sql}}
    }

    protected doBegin(connection: { query(sql: string): any }, options: TransactionOptions): Awaitable<{ query(sql: string): any }> {
        return connection.query('begin');
    }

    child(connection: { query(sql: string): any }, options: TransactionOptions): Awaitable<{ query(sql: string): any }> {
        return connection.query('begin');
    }
    commit(connection: { query(sql: string): any; }): Awaitable<void> {
        return connection.query('commit');
    }
    rollback(connection: { query(sql: string): any; }, error: any): Awaitable<void> {
        return connection.query('rollback');
    }
    close(connection: { query(): any; }): Awaitable<void> {
    }

    @OnConstruct()
    async init() {
        for(const v of this.getSources()) {
            await this.connect(v.name, v);
        }
    }
}

@Component()
class MyRepository {
    constructor(private readonly table: string, private readonly tm = inject(TransactionManager), private readonly dataSource?: string) {
    }
    protected get conn() {
        return this.tm.getConnection<{query(sql: string): any}>({driver: 'my', target: this, dataSource: this.dataSource})
    }
    findOne(id:string) {
        return this.conn.query(`select * from ${this.table} where id = ${id}`)
    }
}

// example app

@Component()
class UserRepository extends MyRepository {
    constructor() {
        super('user');
    }

    async createUser(name: string) {
        return this.conn.query(`insert into user (name) values (${name})`)
    }
}

// standardize data source configuration

class InstanceOptions {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    schema?: string;
    dialectOptions?: any;
}

class ClusterOptions extends InstanceOptions {
    name?: string;
    dialect: string;
    driver: string;
    readReplicas?: InstanceOptions[];
    maxConnections?: number;
    minConnections?: number;
    connectionTimeout?: number;
    idleTimeout?: number;
    maxLifetime?: number;
}

class NamedClusterOptions extends ClusterOptions {
    name: string;
}

@Configuration("kavri.datasource")
class DataSourceOptions extends ClusterOptions {
    multiSources?: NamedClusterOptions[];
}

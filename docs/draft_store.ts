/*
 * @since 2026-04-09 16:16:49
 * @author acrazing <joking.young@gmail.com>
 */

import type { Awaitable } from './draft';

// new API designs

export declare class Key<T> {
  readonly name: string | undefined;
  declare readonly __type: T | undefined;
  private constructor(name?: string);
  static of<T>(name?: string): Key<T>;
}

// Context is a key-value store backed by Map.
// Uses Key instances as Map keys directly.
// Supports parent chain via extend() for fork isolation.
export interface Context {
  // self owned methods
  has(key: Key<any>): boolean;
  get<V>(key: Key<V>): V | undefined;
  getOrThrow<V>(key: Key<V>): V;
  getOrInsert<V>(key: Key<V>, value: V): V;
  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V;
  set<V>(key: Key<V>, value: V): this;
  delete(key: Key<any>): boolean;
  // the following api delegates the APIs from AsyncScope
  isActive(): boolean;
  run<T>(func: (ctx: Context) => Awaitable<T>): Promise<T>;
  fork<T>(func: (ctx: Context) => Awaitable<T>): Promise<T>;
  enter(): void;
  // internal APIs
  extend(): Context;
}

export declare class AsyncScope {
  // delegates APIs from Context, if is not active, throws error
  has(key: Key<any>): boolean;
  get<V>(key: Key<V>): V | undefined;
  getOrThrow<V>(key: Key<V>): V;
  getOrInsert<V>(key: Key<V>, value: V): V;
  getOrInsertComputed<V>(key: Key<V>, callback: (key: Key<V>) => V): V;
  set<V>(key: Key<V>, value: V): this;
  delete(key: Key<any>): boolean;
  // self APIs
  isActive(): boolean;
  // allow to provide state to run, if already in an als scope, check provided
  // state is current state or not, if not, throw error
  run<T>(func: (ctx: Context) => Awaitable<T>, state?: Context): Promise<T>;
  // allow to provide state to run, if already in an als scope, check provided
  // state is current state or not, if not, throw error
  fork<T>(func: (ctx: Context) => Awaitable<T>, state?: Context): Promise<T>;
  // allow to provide state to enter, if already in an als scope, check provided
  // state is current state or not, if not, throw error
  enter(state?: Context): void;
  // create a Context without enter an ALS scope
  create(): Context;
}

// optimize @kavri/web's design:
// when start request, don't run in ALS scope, just create a Context
// and pass it into all handlers like interceptor, actions, handlers, see below
// the interceptor/handlers/actions can fork/run/enter a scope via the context
// to avoid force entering an ALS scope

// interceptor
declare abstract class Interceptor {
  abstract intercept(ctx: Context, next: () => unknown): unknown;
}

// controller
declare type ControllerType<T> = {
  // add ctx to the action
  createUser: (params: any, ctx: Context) => Awaitable<any>;
};

declare class UserController implements ControllerType<any> {
  // always put ctx as the second param of controllers
  createUser(params: any, ctx: Context): any;
}

// websocket handler
declare type HandlerType<T> = {
  onSend: (event: any, conn: WebSocketConnection<any>, ctx: Context) => Awaitable<void>;
};

declare class ChatHandler implements HandlerType<any> {
  // add ctx as the third param
  onSend(event: any, conn: WebSocketConnection<any>, ctx: Context): any;
}

// websocket connection

// new added
declare const CONNECTION: Key<WebSocketConnection<any>>;

// no changes
declare class WebSocketConnection<T> {}

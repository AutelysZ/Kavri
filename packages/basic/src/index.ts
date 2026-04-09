export type {
  Qualifier,
  Awaitable,
  AnyConstructor,
  DecoratorStatic,
  ClassDecorator,
  MethodDecorator,
  FieldDecorator,
  ClassDecoratorFactory,
  MethodDecoratorFactory,
  FieldDecoratorFactory,
} from './types.js';

export { MetadataStore } from './metadata.js';
export { Key, AsyncContextStore } from './async-context.js';

import { MetadataStore } from './metadata.js';
import { AsyncContextStore } from './async-context.js';

/**
 * The global metadata store. All decorator metadata in the application
 * is stored and queried through this instance.
 */
export const Metadata = new MetadataStore();

/**
 * The global async context. Provides scoped key-value storage
 * backed by `AsyncLocalStorage`.
 */
export const AsyncContext = new AsyncContextStore();

/**
 * Create a class decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataStore.createClassDecorator}
 */
export const createClassDecorator = Metadata.createClassDecorator.bind(Metadata);

/**
 * Create a method decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataStore.createMethodDecorator}
 */
export const createMethodDecorator = Metadata.createMethodDecorator.bind(Metadata);

/**
 * Create a field decorator that stores typed metadata in the global {@link Metadata} store.
 * @see {@link MetadataStore.createFieldDecorator}
 */
export const createFieldDecorator = Metadata.createFieldDecorator.bind(Metadata);

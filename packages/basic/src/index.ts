// ---------------------------------------------------------------------------
// Global decorator creators (most common API — use these directly)
// ---------------------------------------------------------------------------

export {
  Metadata,
  createClassDecorator,
  createMethodDecorator,
  createFieldDecorator,
  createDecorator,
} from './metadata.js';

// ---------------------------------------------------------------------------
// Metadata manager & entry types
// ---------------------------------------------------------------------------

export { MetadataManager } from './metadata.js';
export type {
  DecoratedEntryBase,
  ClassDecoratedEntry,
  MethodDecoratedEntry,
  FieldDecoratedEntry,
  DecoratedEntry,
  DecoratedEntryOf,
  ComposeOptions,
} from './metadata.js';

// ---------------------------------------------------------------------------
// Async context
// ---------------------------------------------------------------------------

export { Key, AsyncScope } from './context.js';
export type { Context } from './context.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

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
  DecoratorMap,
  UnionToIntersection,
  AnyDecorator,
  AnyDecoratorFactory,
} from './types.js';

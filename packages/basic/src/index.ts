import { polyfill } from '@kavri/env';

polyfill();

export {
  Metadata,
  createClassDecorator,
  createMethodDecorator,
  createFieldDecorator,
  createDecorator,
  type ComposeOptions,
} from './Metadata.js';
export { Key } from './Key.js';
export type { Context } from './Context.js';
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
export { AsyncScope } from './AsyncScope.js';
export { KeyMap } from './KeyMap.js';
export { ChainKeyMap } from './ChainKeyMap.js';

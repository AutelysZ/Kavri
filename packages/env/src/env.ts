import type {
  AsyncLocalStorage,
  BinaryHandler,
  BinaryUnions,
  FileHandler,
  FileUnions,
} from './types.js';

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  throw new Error('Method not implemented');
}

export function registerFileHandlers(
  register: <K extends keyof FileUnions>(
    key: K,
    handler: (value: FileUnions[K]) => FileHandler,
  ) => void,
) {
  throw new Error('Method not implemented');
}

export function registerBinaryHandlers(
  register: <K extends keyof BinaryUnions>(
    key: K,
    handler: (value: BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  throw new Error('Method not implemented');
}

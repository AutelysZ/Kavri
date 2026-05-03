import type { AsyncLocalStorage, BinaryHandler, FileHandler } from './types.js';

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  throw new Error('Method not implemented');
}

export function registerFileHandlers(
  register: <K extends keyof Kavri.FileUnions>(
    key: K,
    handler: (value: Kavri.FileUnions[K]) => FileHandler,
  ) => void,
) {
  throw new Error('Method not implemented');
}

export function registerBinaryHandlers(
  register: <K extends keyof Kavri.BinaryUnions>(
    key: K,
    handler: (value: Kavri.BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  throw new Error('Method not implemented');
}

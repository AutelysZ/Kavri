import type { AsyncLocalStorage } from 'node:async_hooks';
import type { BinaryHandler, BinaryUnions, FileHandler, FileUnions } from './types.js';

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  throw new Error('Method not implemented');
}

export function registerFileHandlers(
  register: <K extends keyof FileUnions>(
    key: K,
    handler: (value: FileUnions[K]) => FileHandler,
  ) => void,
) {
  register('webFile', (v) => ({ name: v.name, size: v.size }));
  register('webStream', (v) => ({ name: v.name, size: v.size }));
}

export function registerBinaryHandlers(
  register: <K extends keyof BinaryUnions>(
    key: K,
    handler: (value: BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  register('webBinary', (v) => ({ size: v.byteLength }));
  register('webStream', () => ({ size: -1 }));
  register('webBlob', (v) => ({ size: v.size }));
}

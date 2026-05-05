import { AsyncLocalStorage as NodeAsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import { registerBinaryHandlers as webBinary, registerFileHandlers as webFile } from './env.web.js';
import type {
  AsyncLocalStorage,
  BinaryHandler,
  BinaryUnions,
  FileHandler,
  FileUnions,
} from './types.js';

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  return new NodeAsyncLocalStorage<T>();
}

export function registerFileHandlers(
  register: <K extends keyof FileUnions>(
    key: K,
    handler: (value: FileUnions[K]) => FileHandler,
  ) => void,
) {
  webFile(register);
  register('nodePath', (v) => ({ name: v, size: fs.statSync(v).size }));
  register('nodeStream', (v) => ({ name: v.name, size: v.size }));
}

export function registerBinaryHandlers(
  register: <K extends keyof BinaryUnions>(
    key: K,
    handler: (value: BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  webBinary(register);
  register('nodeStream', () => ({ size: -1 }));
  register('nodePath', (v) => ({ size: fs.statSync(v).size }));
}

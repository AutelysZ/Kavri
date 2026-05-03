import { AsyncLocalStorage as NodeAsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import type { Readable } from 'node:stream';
import type { AsyncLocalStorage, BinaryHandler, FileHandler } from './types.js';

export interface ReadableFile {
  size: number;
  name: string;
  stream: Readable;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Kavri {
    interface FileUnions {
      nodePath: string;
      nodeStream: ReadableFile;
    }

    interface BinaryUnions {
      nodePath: string;
      nodeStream: Readable;
    }
  }
}

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  return new NodeAsyncLocalStorage<T>();
}

export function registerFileHandlers(
  register: <K extends keyof Kavri.FileUnions>(
    key: K,
    handler: (value: Kavri.FileUnions[K]) => FileHandler,
  ) => void,
) {
  register('nodePath', (v) => ({ name: v, size: fs.statSync(v).size }));
  register('nodeStream', (v) => ({ name: v.name, size: v.size }));
}

export function registerBinaryHandlers(
  register: <K extends keyof Kavri.BinaryUnions>(
    key: K,
    handler: (value: Kavri.BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  register('nodeStream', () => ({ size: -1 }));
  register('nodePath', (v) => ({ size: fs.statSync(v).size }));
}

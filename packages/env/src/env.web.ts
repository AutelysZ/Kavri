import type { AsyncLocalStorage } from 'node:async_hooks';
import type { BinaryHandler, FileHandler } from './types.js';

export interface ReadableFile {
  name: string;
  size: number;
  stream: ReadableStream;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Kavri {
    interface FileUnions {
      webFile: File;
      webStream: ReadableFile;
    }

    interface BinaryUnions {
      webBinary: Uint8Array;
      webStream: ReadableStream;
      webBlob: Blob;
    }
  }
}

export function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  throw new Error('Method not implemented');
}

export function registerFileHandlers(
  register: <K extends keyof Kavri.FileUnions>(
    key: K,
    handler: (value: Kavri.FileUnions[K]) => FileHandler,
  ) => void,
) {
  register('webFile', (v) => ({ name: v.name, size: v.size }));
  register('webStream', (v) => ({ name: v.name, size: v.size }));
}

export function registerBinaryHandlers(
  register: <K extends keyof Kavri.BinaryUnions>(
    key: K,
    handler: (value: Kavri.BinaryUnions[K]) => BinaryHandler,
  ) => void,
) {
  register('webBinary', (v) => ({ size: v.byteLength }));
  register('webStream', () => ({ size: -1 }));
  register('webBlob', (v) => ({ size: v.size }));
}

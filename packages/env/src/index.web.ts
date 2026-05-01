import type { AsyncLocalStorage } from 'node:async_hooks';
import type { KavriEnv } from './env.js';

export type * from './env.js';

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

export const Env: KavriEnv = {
  get AsyncLocalStorage(): typeof AsyncLocalStorage {
    throw new Error('Unsupported');
  },

  registerFileHandlers: (register) => {
    register('webFile', (v) => ({ name: v.name, size: v.size }));
    register('webStream', (v) => ({ name: v.name, size: v.size }));
  },

  registerBinaryHandlers: (register) => {
    register('webBinary', (v) => ({ size: v.byteLength }));
    register('webStream', () => ({ size: -1 }));
    register('webBlob', (v) => ({ size: v.size }));
  },
};

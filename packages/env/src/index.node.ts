import { AsyncLocalStorage } from 'node:async_hooks';
import type { KavriEnv } from './env.js';
import * as fs from 'node:fs';
import type { Readable } from 'node:stream';

export type * from './env.js';

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

export const Env: KavriEnv = {
  AsyncLocalStorage: AsyncLocalStorage,
  registerFileHandlers: (register) => {
    register('nodePath', (v) => ({ name: v, size: fs.statSync(v).size }));
    register('nodeStream', (v) => ({ name: v.name, size: v.size }));
  },
  registerBinaryHandlers: (register) => {
    register('nodeStream', () => ({ size: -1 }));
    register('nodePath', (v) => ({ size: fs.statSync(v).size }));
  },
};

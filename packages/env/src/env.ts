import type { AsyncLocalStorage } from 'node:async_hooks';

export type { AsyncLocalStorage };

export interface FileHandler {
  name: string;
  size: number;
}

export interface BinaryHandler {
  size: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Kavri {
    interface FileUnions {}

    interface BinaryUnions {}
  }
}

export interface KavriEnv {
  readonly AsyncLocalStorage: typeof AsyncLocalStorage;
  registerFileHandlers: (
    register: <K extends keyof Kavri.FileUnions>(
      key: K,
      handler: (value: Kavri.FileUnions[K]) => FileHandler,
    ) => void,
  ) => void;
  registerBinaryHandlers: (
    register: <K extends keyof Kavri.BinaryUnions>(
      key: K,
      handler: (value: Kavri.BinaryUnions[K]) => BinaryHandler,
    ) => void,
  ) => void;
}

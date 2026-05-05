import type { Readable } from 'node:stream';

export interface NodeReadableFile {
  size: number;
  name: string;
  stream: Readable;
}

export interface ReadableFile {
  name: string;
  size: number;
  stream: ReadableStream;
}

export interface FileHandler {
  name: string;
  size: number;
}

export interface BinaryHandler {
  size: number;
}

export interface FileUnions {
  nodePath: string;
  nodeStream: NodeReadableFile;
  webFile: File;
  webStream: ReadableFile;
}

export interface BinaryUnions {
  nodePath: string;
  nodeStream: Readable;
  webBinary: Uint8Array;
  webStream: ReadableStream;
  webBlob: Blob;
}

export interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
  enterWith(store: T): void;
}

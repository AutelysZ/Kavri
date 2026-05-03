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

export interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
  enterWith(store: T): void;
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorVersion: '2023-11',
        },
      },
    }),
  ],
  // Disable Oxc transform — SWC handles TS + TC39 decorators
  oxc: false,
  resolve: {
    alias: {
      // The default `@kavri/env` source export is a `null as never` placeholder
      // intended for runtime injection. In Node tests we want the real
      // `AsyncLocalStorage`-backed implementation.
      '@kavri/env': path.resolve(__dirname, 'packages/env/src/index.node.ts'),
    },
  },
  test: {
    passWithNoTests: true,
  },
});

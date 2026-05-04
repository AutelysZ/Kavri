import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

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
    // `.node.ts` first so `'./env'` style imports prefer the Node-flavored
    // source files in tests; the rest are Vite defaults (`.js` / `.mjs` are
    // needed by node_modules packages that use extensionless imports).
    extensions: ['.node.ts', '.ts', '.mjs', '.js', '.mts', '.jsx', '.tsx', '.json'],
  },
  test: {
    passWithNoTests: true,
    setupFiles: ['./packages/basic/test-setup.ts'],
    // `temp/` holds tsc incremental build output (mirrors of source `.test.ts`
    // files compiled to `.test.js`) — they're not test source.
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**'],
  },
});

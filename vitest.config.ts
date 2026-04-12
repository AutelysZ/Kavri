import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

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
  test: {
    passWithNoTests: true,
  },
});

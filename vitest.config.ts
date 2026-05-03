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
    extensions: ['.node.ts', '.ts', '.json'],
  },
  test: {
    passWithNoTests: true,
  },
});

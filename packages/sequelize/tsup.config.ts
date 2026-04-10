import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  sourcemap: true,
  clean: true,
  target: ['chrome100', 'node20'],
  outExtension: () => ({ js: '.mjs', dts: '.d.mts' }),
  external: [/^@kavri\//, /^node:/],
});

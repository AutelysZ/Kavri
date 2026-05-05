import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    dts: false,
    sourcemap: true,
    clean: true,
    target: 'node20',
    tsconfig: './tsconfig.build.json',
    outExtension: () => ({ js: '.node.mjs' }),
    esbuildOptions: (opts) => {
      opts.resolveExtensions = ['.node.ts', '.ts', '.js', '.json'];
    },
  },
  {
    entry: ['src/index.ts'],
    format: 'esm',
    dts: false,
    sourcemap: true,
    target: 'chrome100',
    tsconfig: './tsconfig.build.json',
    outExtension: () => ({ js: '.web.mjs' }),
    esbuildOptions: (opts) => {
      opts.resolveExtensions = ['.web.ts', '.ts', '.js', '.json'];
    },
  },
  {
    entry: ['src/index.ts'],
    format: 'esm',
    dts: { only: true },
    tsconfig: './tsconfig.build.json',
    outExtension: () => ({ dts: '.d.ts' }),
  },
]);

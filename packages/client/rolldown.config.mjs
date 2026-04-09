import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  output: {
    file: 'index.js',
    format: 'esm',
    sourcemap: true,
  },
  external: [/^@kavri\//, /^node:/],
});

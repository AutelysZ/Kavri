import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'packages/*/dist/',
      'packages/*/tsdown.config.ts',
      'docs/',
      'coverage/',
      '*.js',
      '*.mjs',
      'scripts/',
    ],
  },
);

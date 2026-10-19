import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const threeOnlyInViewport = {
  regex: '^(three|@react-three)(/|$)',
  message: 'Only src/viewport and src/bench import three.js and React Three Fiber.',
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'public', 'assets-src', 'docs/design']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/viewport/**', 'src/bench/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [threeOnlyInViewport] }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            threeOnlyInViewport,
            {
              regex: '^\\.\\./(state|i18n/useT)(/|$)',
              message: 'src/ui imports nothing from src/state or useT; App passes the values in.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(?!\\./|zod(/|$))', message: 'src/domain imports only src/domain and zod.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/state/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='useEditor'][property.name='setState']",
          message: 'Change editor state through src/state/actions.ts.',
        },
      ],
    },
  },
  {
    files: ['scripts/**', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['e2e/**', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
]);

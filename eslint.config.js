import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.amplify']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Playwright runs in Node; in-page callbacks (page.evaluate etc.) also touch browser globals.
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Backend (Amplify/Lambda) and tooling code: Node runtime, not browser; no React rules.
    files: ['amplify/**/*.ts', 'scripts/**/*.mjs'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])

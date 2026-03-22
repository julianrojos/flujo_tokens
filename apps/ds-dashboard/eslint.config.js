/**
 * ESLint Configuration
 *
 * Prevents accidental imports of Anthropic/OpenAI SDKs in frontend code.
 * These SDKs can only be imported in /server/ directory.
 *
 * Note: no-undef and no-unused-vars are disabled for baseline compatibility.
 * These can be re-enabled gradually as part of a linting improvement plan.
 */

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.tmp/**',
      'docs/**',
      '*.min.js',
    ],
  },
  // Global baseline: disable noisy rules for all files
  {
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      'react-hooks/exhaustive-deps': 'off',
      /**
       * max-lines: warn on large files to prevent future monolithic files.
       * Threshold: 500 lines for pages/components (after this refactor, all 4 pages are <200 lines).
       * skipBlankLines and skipComments to focus on actual code.
       * Using 'warn' to avoid breaking CI on existing legacy files.
       */
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  // Frontend code: block SDK imports
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        MessageEvent: 'readonly',
        WebSocket: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      /**
       * CRITICAL: Prevent SDK imports in frontend code.
       * These must only be in /server/ for security & bundle size.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@anthropic-ai/sdk'],
              message:
                'Anthropic SDK must only be imported in /server/. Frontend must use HTTP API endpoints.',
            },
            {
              group: ['openai'],
              message:
                'OpenAI SDK must only be imported in /server/. Frontend must use HTTP API endpoints.',
            },
          ],
        },
      ],
    },
  },
  // Server-side code: allow SDK imports
  {
    files: ['server/**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        WebSocket: 'readonly',
        MessageEvent: 'readonly',
        Event: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        crypto: 'readonly',
        Crypto: 'readonly',
        performance: 'readonly',
        Performance: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // No restrictions on server-side code
    },
  },
  // Tests, tooling, and scripts: block SDK imports (should use server endpoints)
  {
    files: ['tests/**/*.{ts,tsx,js,jsx,mjs}', 'tooling/**/*.{ts,tsx,js,jsx,mjs}', 'scripts/**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Node.js + test globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        WebSocket: 'readonly',
        MessageEvent: 'readonly',
        Event: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        Crypto: 'readonly',
        performance: 'readonly',
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        assert: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      /**
       * CRITICAL: Prevent SDK imports in tests/tooling/scripts.
       * These must use server HTTP API endpoints, not direct SDK calls.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@anthropic-ai/sdk'],
              message:
                'Anthropic SDK must only be imported in /server/. Tests/tooling/scripts must use HTTP API endpoints.',
            },
            {
              group: ['openai'],
              message:
                'OpenAI SDK must only be imported in /server/. Tests/tooling/scripts must use HTTP API endpoints.',
            },
          ],
        },
      ],
    },
  },
];

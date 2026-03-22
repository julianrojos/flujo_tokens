const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.min.js',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
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
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        WebSocket: 'readonly',
        MessageEvent: 'readonly',
        Event: 'readonly',
        parent: 'readonly',
        process: 'readonly',
      },
    },
  },
];

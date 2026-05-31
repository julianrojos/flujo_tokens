import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: './',
  esbuild: {
    target: 'es2018',
  },
  build: {
    target: 'es2018',
    outDir: 'dist',
    rollupOptions: {
      input: {
        code: resolve(__dirname, 'src/code.ts'),
        ui: resolve(__dirname, 'ui.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'code') return 'code.js';
          if (chunkInfo.name === 'ui') return 'ui.js';
          return '[name].js';
        },
      },
    },
  },
});

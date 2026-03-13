import { defineConfig } from 'vite';
import { resolve } from 'path';

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

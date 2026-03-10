import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  esbuild: {
    target: 'es2017',
  },
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/ui/index.tsx'),
      formats: ['iife'],
      name: 'FigmaPluginUI',
      fileName: () => 'ui.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

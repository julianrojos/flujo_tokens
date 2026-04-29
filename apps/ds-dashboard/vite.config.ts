import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = Number(process.env.DS_DASHBOARD_API_PORT || 8787);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPS_API_PROXY_TARGET =
  process.env.DS_DASHBOARD_API_URL || `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (!normalizedId.includes("/node_modules/")) return undefined;
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/react-router-dom/")
          ) {
            return "vendor-react";
          }
          if (
            normalizedId.includes("/@tiptap/") ||
            normalizedId.includes("/tiptap-markdown/")
          ) {
            return "vendor-tiptap";
          }
          if (
            normalizedId.includes("/react-markdown/") ||
            normalizedId.includes("/remark-gfm/")
          ) {
            return "vendor-markdown";
          }
          if (normalizedId.includes("/@tanstack/react-query/")) {
            return "vendor-query";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        target: OPS_API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});

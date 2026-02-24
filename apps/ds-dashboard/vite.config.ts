import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-ignore
import { SERVER_PORT } from "./server/lib/server-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPS_API_PROXY_TARGET =
  process.env.DS_DASHBOARD_API_URL || `http://127.0.0.1:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react()],
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
  preview: {
    proxy: {
      "/api": {
        target: OPS_API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});

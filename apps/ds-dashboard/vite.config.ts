import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

type Middleware = (
  req: { method?: string; url?: string },
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
  },
  next: () => void,
) => void | Promise<void>;

function sendJson(
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string) => void;
  },
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function createLocalDataApi() {
  const repoRoot = path.resolve(__dirname, "../..");
  const componentRegistryPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "component-registry.json",
  );
  const tokenRegistryPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "token-registry.json",
  );

  const middleware: Middleware = async (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const url = String(req.url || "").split("?")[0];

    try {
      if (method === "GET" && url === "/api/component-registry") {
        const raw = await fs.readFile(componentRegistryPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/token-registry") {
        const raw = await fs.readFile(tokenRegistryPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "POST" && url === "/api/refresh-registry") {
        const child = spawn("npm", ["run", "ds:registry:refresh"], {
          cwd: repoRoot,
          shell: false,
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.on("close", (code) => {
          if (code === 0) {
            sendJson(res, 200, {
              ok: true,
              command: "npm run ds:registry:refresh",
              output: stdout.trim(),
            });
            return;
          }

          sendJson(res, 500, {
            ok: false,
            command: "npm run ds:registry:refresh",
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        });
        return;
      }
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    next();
  };

  return {
    name: "local-data-api",
    configureServer(server: {
      middlewares: { use: (fn: Middleware) => void };
    }) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: {
      middlewares: { use: (fn: Middleware) => void };
    }) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), createLocalDataApi()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
  },
});

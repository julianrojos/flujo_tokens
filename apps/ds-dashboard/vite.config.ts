import fs from "node:fs/promises";
import fsSync from "node:fs";
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

type ComponentRegistryRow = {
  slug?: string;
  display_name?: string;
  paths?: {
    spec?: string;
  };
};

type ComponentUsageBySlug = Record<
  string,
  {
    uses: string[];
    used_in: string[];
  }
>;

function normalizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function singularizeSlug(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (normalized.endsWith("ies") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function extractExplicitRelatedComponents(rawSpec: string): string[] {
  const blockMatch = String(rawSpec || "").match(
    /^related_components:\s*\n((?:[ \t]*-\s*[^\n]+\n?)*)/m,
  );
  if (!blockMatch) return [];

  const rows = String(blockMatch[1] || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  return rows
    .map((line) =>
      line
        .replace(/^- /, "")
        .trim()
        .replace(/^['"]|['"]$/g, ""),
    )
    .filter(Boolean)
    .map((item) => normalizeSlug(item));
}

function extractAnatomyItemRefs(rawSpec: string): string[] {
  const refs = new Set<string>();
  const text = String(rawSpec || "");
  const idRegex = /^\s*-\s*id:\s*([A-Za-z0-9_-]+)\s*$/gm;
  let idMatch: RegExpExecArray | null = null;
  while ((idMatch = idRegex.exec(text)) !== null) {
    const id = normalizeSlug(String(idMatch[1] || ""));
    if (!id) continue;
    if (id.endsWith("_item") || id.endsWith("_items")) {
      const base = id.replace(/_items?$/, "");
      if (base) refs.add(base);
      const singular = singularizeSlug(base);
      if (singular) refs.add(singular);
    }
  }

  const instanceRegex = /\b([A-Z][A-Za-z0-9_-]*)\s+instances\b/g;
  let instanceMatch: RegExpExecArray | null = null;
  while ((instanceMatch = instanceRegex.exec(text)) !== null) {
    const token = normalizeSlug(String(instanceMatch[1] || ""));
    if (token) {
      refs.add(token);
      refs.add(singularizeSlug(token));
    }
  }

  return Array.from(refs);
}

function buildComponentUsageIndex(
  rows: ComponentRegistryRow[],
  repoRoot: string,
): {
  by_slug: ComponentUsageBySlug;
} {
  const slugSet = new Set(
    rows.map((row) => normalizeSlug(String(row.slug || ""))).filter(Boolean),
  );
  const usesMap = new Map<string, Set<string>>();
  for (const slug of Array.from(slugSet)) usesMap.set(slug, new Set());

  for (const row of rows) {
    const ownerSlug = normalizeSlug(String(row.slug || ""));
    if (!ownerSlug || !usesMap.has(ownerSlug)) continue;
    const specRelPath = String(row.paths?.spec || "").trim();
    if (!specRelPath) continue;
    const specPath = path.resolve(repoRoot, specRelPath);

    let rawSpec = "";
    try {
      rawSpec = fsSync.readFileSync(specPath, "utf8");
    } catch {
      continue;
    }

    const refs = new Set<string>([
      ...extractExplicitRelatedComponents(rawSpec),
      ...extractAnatomyItemRefs(rawSpec),
    ]);
    for (const ref of Array.from(refs)) {
      const normalized = normalizeSlug(ref);
      const singular = singularizeSlug(normalized);
      const finalRef = slugSet.has(normalized)
        ? normalized
        : slugSet.has(singular)
          ? singular
          : "";
      if (!finalRef || finalRef === ownerSlug) continue;
      usesMap.get(ownerSlug)?.add(finalRef);
    }
  }

  const usedInMap = new Map<string, Set<string>>();
  for (const slug of Array.from(slugSet)) usedInMap.set(slug, new Set());

  for (const [ownerSlug, uses] of Array.from(usesMap.entries())) {
    for (const targetSlug of Array.from(uses)) {
      usedInMap.get(targetSlug)?.add(ownerSlug);
    }
  }

  const bySlug: ComponentUsageBySlug = {};
  for (const slug of Array.from(slugSet).sort((a, b) => a.localeCompare(b))) {
    bySlug[slug] = {
      uses: Array.from(usesMap.get(slug) || []).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
      used_in: Array.from(usedInMap.get(slug) || []).sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
    };
  }

  return {
    by_slug: bySlug,
  };
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
  const tokenUsageIndexPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "token-usage-index.json",
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

      if (method === "GET" && url === "/api/component-usage-index") {
        const raw = await fs.readFile(componentRegistryPath, "utf8");
        const registry = JSON.parse(raw) as { components?: ComponentRegistryRow[] };
        const payload = buildComponentUsageIndex(registry.components || [], repoRoot);
        sendJson(res, 200, payload);
        return;
      }

      if (method === "GET" && url === "/api/token-registry") {
        const raw = await fs.readFile(tokenRegistryPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/token-usage-index") {
        const raw = await fs.readFile(tokenUsageIndexPath, "utf8");
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

      if (method === "POST" && url === "/api/refresh-token-usage-index") {
        const child = spawn("npm", ["run", "ds:token-usage-index"], {
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
              command: "npm run ds:token-usage-index",
              output: stdout.trim(),
            });
            return;
          }

          sendJson(res, 500, {
            ok: false,
            command: "npm run ds:token-usage-index",
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

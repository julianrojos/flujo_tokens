import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import yaml from "js-yaml";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

type Middleware = (
  req: { method?: string; url?: string },
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string | Buffer) => void;
  },
  next: () => void,
) => void | Promise<void>;

type TokenRegistryEntry = {
  path?: string;
  slashPath?: string;
  cssVar?: string;
  type?: string;
  resolvedValue?: string;
  collection?: string;
};

type TokenTreeNode = {
  id: string;
  name: string;
  type: "collection" | "group" | "token";
  path: string;
  children: TokenTreeNode[];
  tokenData?: TokenRegistryEntry;
};

function sendJson(
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string | Buffer) => void;
  },
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function runNpmScript(args: {
  repoRoot: string;
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string | Buffer) => void;
  };
  script: string;
  commandLabel?: string;
}) {
  const script = String(args.script || "").trim();
  if (!script) {
    sendJson(args.res, 400, { ok: false, message: "Missing script name." });
    return;
  }

  const commandLabel = args.commandLabel || `npm run ${script}`;
  const child = spawn("npm", ["run", script], {
    cwd: args.repoRoot,
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

  child.on("error", (error) => {
    sendJson(args.res, 500, {
      ok: false,
      command: commandLabel,
      message: error instanceof Error ? error.message : String(error),
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  });

  child.on("close", (code) => {
    if (code === 0) {
      sendJson(args.res, 200, {
        ok: true,
        command: commandLabel,
        output: stdout.trim(),
      });
      return;
    }

    sendJson(args.res, 500, {
      ok: false,
      command: commandLabel,
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  });
}

function validateGitRef(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length > 140) return null;
  if (value.includes(":")) return null;
  if (/\s/.test(value)) return null;
  if (!/^[A-Za-z0-9._/~^-]+$/.test(value)) return null;
  return value;
}

function runNodeJsonCommand(args: {
  repoRoot: string;
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string | Buffer) => void;
  };
  commandLabel: string;
  scriptPath: string;
  scriptArgs: string[];
}) {
  const child = spawn("node", [args.scriptPath, ...args.scriptArgs], {
    cwd: args.repoRoot,
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

  child.on("error", (error) => {
    sendJson(args.res, 500, {
      ok: false,
      command: args.commandLabel,
      message: error instanceof Error ? error.message : String(error),
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  });

  child.on("close", (code) => {
    if (code !== 0) {
      sendJson(args.res, 500, {
        ok: false,
        command: args.commandLabel,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
      return;
    }

    try {
      const parsed = JSON.parse(stdout);
      sendJson(args.res, 200, parsed);
    } catch (error) {
      sendJson(args.res, 500, {
        ok: false,
        command: args.commandLabel,
        message: "Command returned invalid JSON.",
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        parse_error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function guessContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

const MAX_FILE_BYTES = 450_000;
const MAX_SNIPPET_LINES = 15;

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveRepoFilePath(repoRoot: string, requestedPath: string) {
  const raw = String(requestedPath || "").trim();
  if (!raw) return null;
  const resolved = path.resolve(repoRoot, raw);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (resolved !== repoRoot && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

async function readTextFileLimited(absPath: string, maxBytes: number) {
  const buffer = await fs.readFile(absPath);
  const truncated = buffer.byteLength > maxBytes;
  const sliced = truncated ? buffer.subarray(0, maxBytes) : buffer;
  return { content: sliced.toString("utf8"), truncated };
}

function findLineForQuery(content: string, query: string): number | null {
  const q = String(query || "").trim();
  if (!q) return null;
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const before = content.slice(0, idx);
  return before.split("\n").length;
}

function buildSnippet(content: string, line: number, before: number, after: number) {
  const lines = content.split("\n");
  const target = clampInt(line, 1, Math.max(1, lines.length));
  const safeBefore = clampInt(before, 0, MAX_SNIPPET_LINES - 1);
  const safeAfter = clampInt(after, 0, MAX_SNIPPET_LINES - 1 - safeBefore);
  const startLine = clampInt(target - safeBefore, 1, target);
  const endLine = clampInt(target + safeAfter, target, lines.length);
  const snippetLines = lines.slice(startLine - 1, endLine);
  return { targetLine: target, startLine, endLine, snippet: snippetLines.join("\n") };
}

function buildTokenCollectionTrees(entries: TokenRegistryEntry[]) {
  const byCollection = new Map<string, TokenRegistryEntry[]>();
  for (const entry of entries) {
    const collection = String(entry.collection || "Uncategorized").trim() || "Uncategorized";
    if (!byCollection.has(collection)) byCollection.set(collection, []);
    byCollection.get(collection)?.push(entry);
  }

  const collections = Array.from(byCollection.entries())
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([collection, collectionEntries]) => {
      const root: TokenTreeNode = {
        id: `collection:${collection}`,
        name: collection,
        type: "collection",
        path: collection,
        children: [],
      };
      const nodeByPath = new Map<string, TokenTreeNode>();
      nodeByPath.set(root.path, root);

      const sortedEntries = collectionEntries
        .slice()
        .sort((a, b) =>
          String(a.path || a.slashPath || "").localeCompare(
            String(b.path || b.slashPath || ""),
            "en",
            { sensitivity: "base" },
          ),
        );

      for (const entry of sortedEntries) {
        const slashPath = String(entry.slashPath || "").trim();
        const pathValue = String(entry.path || "").trim();
        const normalizedPath = slashPath || pathValue.replace(/\./g, "/");
        if (!normalizedPath) continue;
        const rawSegments = normalizedPath.split("/").filter(Boolean);
        const segments =
          rawSegments[0]?.localeCompare(collection, "en", { sensitivity: "base" }) === 0
            ? rawSegments.slice(1)
            : rawSegments;
        if (segments.length === 0) continue;

        let currentPath = collection;
        let parent = root;
        for (let i = 0; i < segments.length; i += 1) {
          const segment = segments[i];
          const isLeaf = i === segments.length - 1;
          currentPath = `${currentPath}/${segment}`;

          if (isLeaf) {
            const tokenNode: TokenTreeNode = {
              id: `token:${currentPath}`,
              name: segment,
              type: "token",
              path: currentPath,
              children: [],
              tokenData: entry,
            };
            parent.children.push(tokenNode);
            continue;
          }

          let groupNode = nodeByPath.get(currentPath);
          if (!groupNode) {
            groupNode = {
              id: `group:${currentPath}`,
              name: segment,
              type: "group",
              path: currentPath,
              children: [],
            };
            nodeByPath.set(currentPath, groupNode);
            parent.children.push(groupNode);
          }
          parent = groupNode;
        }
      }

      const sortTree = (nodes: TokenTreeNode[]) => {
        nodes.sort((a, b) => {
          if (a.type !== b.type) {
            if (a.type === "token") return 1;
            if (b.type === "token") return -1;
          }
          return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        });
        for (const node of nodes) {
          if (node.children.length > 0) sortTree(node.children);
        }
      };
      sortTree(root.children);

      return {
        collection,
        tokenCount: collectionEntries.length,
        root,
      };
    });

  return {
    collections,
    summary: {
      collections: collections.length,
      tokens: entries.length,
    },
  };
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
  const tokenGraphVizPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "token-graph.viz.json",
  );
  const tokenUsageIndexPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "token-usage-index.json",
  );
  const tokenHealthPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "token-health.json",
  );
  const componentsHealthPath = path.join(
    repoRoot,
    "docs",
    "_generated",
    "components-health.json",
  );
  const tokenDiffScriptPath = path.join(
    repoRoot,
    "tooling",
    "scripts",
    "ds-token-diff.mjs",
  );

  const middleware: Middleware = async (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const requestUrl = new URL(String(req.url || ""), "http://localhost");
    const url = requestUrl.pathname;
    const searchParams = requestUrl.searchParams;

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

      if (method === "GET" && url === "/api/token-collection-trees") {
        const raw = await fs.readFile(tokenRegistryPath, "utf8");
        const parsed = JSON.parse(raw) as { entries?: TokenRegistryEntry[] };
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        sendJson(res, 200, buildTokenCollectionTrees(entries));
        return;
      }

      if (method === "GET" && url === "/api/token-usage-index") {
        const raw = await fs.readFile(tokenUsageIndexPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/token-graph") {
        const raw = await fs.readFile(tokenGraphVizPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/token-health") {
        const raw = await fs.readFile(tokenHealthPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/components-health") {
        const raw = await fs.readFile(componentsHealthPath, "utf8");
        sendJson(res, 200, JSON.parse(raw));
        return;
      }

      if (method === "GET" && url === "/api/token-diff") {
        const beforeRefRaw = searchParams.get("beforeRef") ?? "HEAD~1";
        const beforeRef = validateGitRef(beforeRefRaw);
        if (!beforeRef) {
          sendJson(res, 400, {
            ok: false,
            message:
              "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
          });
          return;
        }

        runNodeJsonCommand({
          repoRoot,
          res,
          commandLabel: `node tooling/scripts/ds-token-diff.mjs --before-ref ${beforeRef} --format json`,
          scriptPath: tokenDiffScriptPath,
          scriptArgs: ["--before-ref", beforeRef, "--format", "json"],
        });
        return;
      }

      if (method === "GET" && url === "/api/file") {
        const requested = searchParams.get("path") ?? searchParams.get("file") ?? "";
        const absPath = resolveRepoFilePath(repoRoot, requested);
        if (!absPath) {
          sendJson(res, 400, { ok: false, message: "Invalid file path." });
          return;
        }
        try {
          const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
          sendJson(res, 200, {
            ok: true,
            file: requested,
            truncated: payload.truncated,
            content: payload.content,
          });
        } catch (error) {
          sendJson(res, 404, {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (method === "GET" && url === "/api/file-snippet") {
        const requested = searchParams.get("file") ?? "";
        const absPath = resolveRepoFilePath(repoRoot, requested);
        if (!absPath) {
          sendJson(res, 400, { ok: false, message: "Invalid file path." });
          return;
        }

        const rawLine = searchParams.get("line");
        const rawBefore = searchParams.get("before");
        const rawAfter = searchParams.get("after");
        const before = rawBefore ? Number.parseInt(rawBefore, 10) : 2;
        const after = rawAfter ? Number.parseInt(rawAfter, 10) : 2;
        const query = searchParams.get("q") ?? "";

        let line = rawLine ? Number.parseInt(rawLine, 10) : NaN;
        if (rawLine && !Number.isFinite(line)) {
          sendJson(res, 400, { ok: false, message: "Invalid line parameter." });
          return;
        }

        let content = "";
        try {
          const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
          content = payload.content;
        } catch (error) {
          sendJson(res, 404, {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        let matchedBy: "line" | "query" = "line";
        if (!rawLine) {
          const detected = findLineForQuery(content, query);
          if (!detected) {
            sendJson(res, 404, {
              ok: false,
              message: "Query not found in file.",
            });
            return;
          }
          line = detected;
          matchedBy = "query";
        }

        const snippet = buildSnippet(content, line, before, after);
        sendJson(res, 200, {
          ok: true,
          file: requested,
          line: snippet.targetLine,
          startLine: snippet.startLine,
          endLine: snippet.endLine,
          matchedBy,
          snippet: snippet.snippet,
        });
        return;
      }

      if (method === "GET" && url === "/api/asset") {
        const requested = searchParams.get("path") ?? "";
        const absPath = resolveRepoFilePath(repoRoot, requested);
        if (!absPath) {
          sendJson(res, 400, { ok: false, message: "Invalid asset path." });
          return;
        }

        try {
          const stat = await fs.stat(absPath);
          if (!stat.isFile()) {
            sendJson(res, 404, { ok: false, message: "Asset not found." });
            return;
          }
          const buffer = await fs.readFile(absPath);
          res.statusCode = 200;
          res.setHeader("Content-Type", guessContentType(absPath));
          res.setHeader("Cache-Control", "no-store");
          res.end(buffer);
        } catch (error) {
          sendJson(res, 404, {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const specMatch = method === "GET" && url.match(/^\/api\/component-spec\/([^/]+)$/);
      if (specMatch) {
        const slug = decodeURIComponent(String(specMatch[1]));
        const registryRaw = await fs.readFile(componentRegistryPath, "utf8");
        const registry = JSON.parse(registryRaw) as { components?: ComponentRegistryRow[] };
        const component = (registry.components ?? []).find(
          (c) => String(c.slug ?? "") === slug,
        );
        if (!component) {
          sendJson(res, 404, { ok: false, message: `Component '${slug}' not found` });
          return;
        }
        const specRelPath = String(component.paths?.spec ?? "").trim();
        if (!specRelPath) {
          sendJson(res, 404, { ok: false, message: `No spec path for '${slug}'` });
          return;
        }
        const specAbsPath = path.resolve(repoRoot, specRelPath);
        const raw = await fs.readFile(specAbsPath, "utf8");
        let parsed: unknown = null;
        try {
          parsed = yaml.load(raw);
        } catch {
          // parsed stays null; frontend can fall back to raw display
        }
        sendJson(res, 200, { ok: true, slug, path: specRelPath, raw, parsed });
        return;
      }

      if (method === "POST" && url === "/api/refresh-registry") {
        runNpmScript({ repoRoot, res, script: "ds:registry:refresh" });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-usage-index") {
        runNpmScript({ repoRoot, res, script: "ds:token-usage-index" });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-graph") {
        runNpmScript({ repoRoot, res, script: "ds:token-graph" });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-health") {
        runNpmScript({ repoRoot, res, script: "ds:token-health" });
        return;
      }

      if (method === "POST" && url === "/api/refresh-components-health") {
        runNpmScript({ repoRoot, res, script: "ds:registry:report" });
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

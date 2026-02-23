import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import yaml from "js-yaml";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { computeImpactReport } from "./src/lib/impact";
import { analyzeNamingDebt } from "./src/lib/naming-debt";
import { buildSpecDiff } from "./src/lib/spec-diff";
import { validateComponentSpec } from "./src/lib/spec-validator";
import type { ComponentSpec } from "./src/types/component-spec";
import type { ImpactWcagPairConfig } from "./src/types/impact";
import type { NamingDebtReport } from "./src/types/naming-debt";
import type { SpecValidationResult } from "./src/types/spec-editor";
import type { TokenRegistry } from "./src/types/token-registry";
import type { TokenGraphViz } from "./src/types/token-graph";
import type { TokenUsageIndex } from "./src/types/token-usage-index";
import type { NamingDebtConfigInput } from "./src/lib/naming-debt";

type Middleware = (
  req: {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    on: (event: string, listener: (chunk?: Buffer | string) => void) => void;
  },
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

type HealthHistoryRange = "7d" | "30d" | "90d";

type HealthHistorySnapshot = {
  captured_at: string;
  metrics: {
    breaking_changes: number | null;
    wcag_failures_total: number;
    coverage_avg: number;
    unresolved_total: number;
    unused_tokens_total: number;
    needs_review_total: number;
  };
  fingerprints: {
    token_health: string;
    components_health: string;
    token_usage: string;
    token_diff: string;
    signature_sha256: string;
  };
  meta: {
    before_ref: string;
  };
};

function normalizeHealthHistoryRange(raw: string | null): HealthHistoryRange {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "7d" || value === "90d") return value;
  return "30d";
}

function rangeDays(range: HealthHistoryRange) {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function normalizeHealthHistoryPayload(raw: unknown) {
  const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSnapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  const snapshots: HealthHistorySnapshot[] = [];

  for (const item of rawSnapshots) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const capturedAt = String(row.captured_at || "").trim();
    if (!capturedAt) continue;

    const metrics = (row.metrics as Record<string, unknown> | undefined) || {};
    const fingerprints = (row.fingerprints as Record<string, unknown> | undefined) || {};
    const meta = (row.meta as Record<string, unknown> | undefined) || {};

    snapshots.push({
      captured_at: capturedAt,
      metrics: {
        breaking_changes:
          metrics.breaking_changes === null
            ? null
            : Number.isFinite(Number(metrics.breaking_changes))
              ? Number(metrics.breaking_changes)
              : null,
        wcag_failures_total: Number(metrics.wcag_failures_total || 0),
        coverage_avg: Number(metrics.coverage_avg || 0),
        unresolved_total: Number(metrics.unresolved_total || 0),
        unused_tokens_total: Number(metrics.unused_tokens_total || 0),
        needs_review_total: Number(metrics.needs_review_total || 0),
      },
      fingerprints: {
        token_health: String(fingerprints.token_health || ""),
        components_health: String(fingerprints.components_health || ""),
        token_usage: String(fingerprints.token_usage || ""),
        token_diff: String(fingerprints.token_diff || ""),
        signature_sha256: String(fingerprints.signature_sha256 || ""),
      },
      meta: {
        before_ref: String(meta.before_ref || "HEAD~1"),
      },
    });
  }

  snapshots.sort((left, right) => left.captured_at.localeCompare(right.captured_at));

  return {
    ok: true,
    schema_version: Number(base.schema_version || 1),
    generated_at: String(base.generated_at || new Date().toISOString()),
    retention_days: Number(base.retention_days || 120),
    snapshots,
    summary: {
      snapshots_total: snapshots.length,
      latest_at: snapshots.length ? snapshots[snapshots.length - 1].captured_at : null,
    },
  };
}

function filterSnapshotsByRange(snapshots: HealthHistorySnapshot[], range: HealthHistoryRange) {
  const days = rangeDays(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const epoch = new Date(snapshot.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoff;
  });
}

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

async function readJsonBody(req: {
  on: (event: string, listener: (chunk?: Buffer | string) => void) => void;
}) {
  const chunks: Buffer[] = [];
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    req.on("data", (chunk) => {
      if (!chunk) return;
      const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      chunks.push(nextChunk);
      const size = chunks.reduce((sum, item) => sum + item.byteLength, 0);
      if (size > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("Expected JSON object body."));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch (error) {
        reject(
          new Error(
            `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
    req.on("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function toBooleanString(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return normalized;
  }
  return fallback ? "true" : "false";
}

function toNumberString(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(fallback);
  return String(parsed);
}

function runNpmScript(args: {
  repoRoot: string;
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body: string | Buffer) => void;
  };
  script: string;
  systemId?: string;
  commandLabel?: string;
}) {
  const script = String(args.script || "").trim();
  if (!script) {
    sendJson(args.res, 400, { ok: false, message: "Missing script name." });
    return;
  }

  const scriptArgs = ["run", script, "--"];
  if (args.systemId) {
    scriptArgs.push("--system", args.systemId);
  }

  const commandLabel = args.commandLabel || `npm run ${script}`;
  const child = spawn("npm", scriptArgs, {
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

async function runCommandCapture(args: {
  cwd: string;
  command: string;
  commandArgs: string[];
}) {
  return await new Promise<{
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
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
      resolve({
        ok: false,
        code: 1,
        stdout: stdout.trim(),
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: typeof code === "number" ? code : 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
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

function normalizeImpactWcagPairs(raw: unknown): ImpactWcagPairConfig[] {
  const list = Array.isArray((raw as { pairs?: unknown[] })?.pairs)
    ? ((raw as { pairs?: unknown[] }).pairs ?? [])
    : [];

  const pairs: ImpactWcagPairConfig[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const foreground = String(row.foreground ?? "").trim();
    const background = String(row.background ?? "").trim();
    if (!foreground || !background) continue;
    const level = String(row.level ?? "AA").trim().toUpperCase() === "AAA" ? "AAA" : "AA";
    const textSize =
      String(row.textSize ?? "normal").trim().toLowerCase() === "large"
        ? "large"
        : "normal";
    pairs.push({ foreground, background, level, textSize });
  }

  return pairs;
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
  systemId?: string;
  allowNonZeroJson?: boolean;
}) {
  const finalArgs = [...args.scriptArgs];
  if (args.systemId) {
    finalArgs.push("--system", args.systemId);
  }
  const child = spawn("node", [args.scriptPath, ...finalArgs], {
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
      if (args.allowNonZeroJson) {
        try {
          const parsed = JSON.parse(stdout || "{}");
          sendJson(args.res, 200, {
            ...parsed,
            ok: false,
            exit_code: code,
            stderr: stderr.trim() || undefined,
          });
          return;
        } catch {
          // fall through to structured error payload
        }
      }
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
const MAX_SPEC_BYTES = 100_000;
const COMPONENT_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

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

function isDevRuntime() {
  return process.env.NODE_ENV === "development";
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sanitizeSlug(raw: string) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!COMPONENT_SLUG_RE.test(slug)) return null;
  return slug;
}

async function resolveComponentSpecTarget(args: {
  repoRoot: string;
  componentRegistryPath: string;
  slug: string;
}) {
  const registryRaw = await fs.readFile(args.componentRegistryPath, "utf8");
  const registry = JSON.parse(registryRaw) as { components?: ComponentRegistryRow[] };
  const component = (registry.components ?? []).find(
    (candidate) => String(candidate.slug ?? "").trim().toLowerCase() === args.slug,
  );
  if (!component) {
    return { ok: false as const, message: `Component '${args.slug}' not found.` };
  }

  const specRelPath = String(component.paths?.spec ?? "").trim();
  if (!specRelPath) {
    return {
      ok: false as const,
      message: `Component '${args.slug}' does not define a spec path.`,
    };
  }

  const specAbsPath = resolveRepoFilePath(args.repoRoot, specRelPath);
  if (!specAbsPath) {
    return {
      ok: false as const,
      message: `Spec path for '${args.slug}' is outside repository root.`,
    };
  }

  return {
    ok: true as const,
    component,
    specRelPath,
    specAbsPath,
  };
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

function parseYamlSafely(raw: string) {
  try {
    const parsed = yaml.load(raw);
    return {
      parsed: (parsed ?? null) as ComponentSpec | null,
      parseError: null as string | null,
    };
  } catch (error) {
    return {
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

type SpecValidationPayload = {
  ok: true;
  slug: string;
  path: string;
  rawHash: string | null;
  parsed: ComponentSpec | null;
  validation: SpecValidationResult;
  diff: ReturnType<typeof buildSpecDiff>;
};

function buildSpecValidationPayload(args: {
  slug: string;
  path: string;
  raw: string;
  baselineParsed: ComponentSpec | null;
  tokenRegistry: TokenRegistry | null;
}): SpecValidationPayload {
  const parsedCandidate = parseYamlSafely(args.raw);
  if (!parsedCandidate.parsed) {
    return {
      ok: true as const,
      slug: args.slug,
      path: args.path,
      rawHash: null,
      parsed: null,
      validation: {
        valid: false,
        blockingIssueCount: 1,
        warningCount: 0,
        issues: [
          {
            severity: "error" as const,
            code: "SPEC_YAML_PARSE_ERROR",
            path: "$",
            message: parsedCandidate.parseError || "Unable to parse YAML.",
            requiresConfirmation: false,
          },
        ],
      },
      diff: [] as ReturnType<typeof buildSpecDiff>,
    };
  }

  const validation = validateComponentSpec(parsedCandidate.parsed, {
    tokenRegistry: args.tokenRegistry,
    previousSpec: args.baselineParsed,
  });

  const diff = buildSpecDiff(args.baselineParsed, parsedCandidate.parsed);
  return {
    ok: true as const,
    slug: args.slug,
    path: args.path,
    rawHash: sha256Text(args.raw),
    parsed: parsedCandidate.parsed,
    validation,
    diff,
  };
}

async function computeNamingDebtReport(args: {
  tokenRegistryPath: string;
  tokenUsageIndexPath: string;
  tokenGraphVizPath: string;
  namingDebtConfigPath: string;
}): Promise<NamingDebtReport> {
  const [tokenRegistryRaw, tokenUsageRaw, tokenGraphRaw, namingConfigRaw] = await Promise.all([
    fs.readFile(args.tokenRegistryPath, "utf8"),
    fs.readFile(args.tokenUsageIndexPath, "utf8").catch(() => "null"),
    fs.readFile(args.tokenGraphVizPath, "utf8").catch(() => "null"),
    fs.readFile(args.namingDebtConfigPath, "utf8").catch(() => "null"),
  ]);

  const tokenRegistry = JSON.parse(tokenRegistryRaw) as TokenRegistry;
  const tokenUsageIndex = tokenUsageRaw ? (JSON.parse(tokenUsageRaw) as TokenUsageIndex | null) : null;
  const tokenGraph = tokenGraphRaw ? (JSON.parse(tokenGraphRaw) as TokenGraphViz | null) : null;
  const config = namingConfigRaw ? (JSON.parse(namingConfigRaw) as NamingDebtConfigInput | null) : null;

  return analyzeNamingDebt({
    tokenRegistry,
    tokenUsageIndex,
    tokenGraph,
    config: config || undefined,
  });
}

let _cachedDesignSystemsConfig: any = null;
const DEFAULT_AUTO_COLLECTIONS = ["Primitives", "Typography", "Semantic", "Components", "A11y"];

function designSystemsConfigPath(repoRoot: string) {
  return path.join(repoRoot, "tooling", "config", "design-systems.json");
}

function readDesignSystemsConfig(repoRoot: string) {
  const raw = fsSync.readFileSync(designSystemsConfigPath(repoRoot), "utf8");
  return JSON.parse(raw);
}

function writeDesignSystemsConfig(repoRoot: string, nextConfig: unknown) {
  const targetPath = designSystemsConfigPath(repoRoot);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fsSync.writeFileSync(tmpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  fsSync.renameSync(tmpPath, targetPath);
}

function normalizeSystemId(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeCollectionList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function ensureRelativeDir(raw: unknown, fallback: string) {
  const value = String(raw || "").trim() || fallback;
  const normalized = value.replace(/\\/g, "/");
  const cleaned = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned || fallback;
}

function normalizeFigmaApiTokenRef(raw: unknown, fallback?: string) {
  const value = String(raw ?? "").trim();
  const source = value || String(fallback ?? "").trim();
  if (!source) return "";
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(source)) return source;
  const dollarVar = source.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dollarVar) return `\${${dollarVar[1]}}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) return `\${${source}}`;
  return source;
}

function resolveSafeSystemPathsForDeletion(system: any, repoRoot: string) {
  const candidates = [system?.inputDir, system?.outputDir, system?.docsDir]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  const safePaths: string[] = [];

  for (const candidate of candidates) {
    const absolute = path.resolve(repoRoot, candidate);
    if (absolute === repoRoot) continue;
    if (!absolute.startsWith(rootWithSep)) continue;
    safePaths.push(absolute);
  }

  return Array.from(new Set(safePaths));
}

function getSystemContextParams(req: { headers?: Record<string, string | string[] | undefined> }) {
  const repoRoot = path.resolve(__dirname, "../..");
  if (!_cachedDesignSystemsConfig) {
    const configRaw = fsSync.readFileSync(path.join(repoRoot, "tooling", "config", "design-systems.json"), "utf8");
    _cachedDesignSystemsConfig = JSON.parse(configRaw);
  }
  const config = _cachedDesignSystemsConfig;

  const headerVal = req.headers?.["x-ds-system"];
  const systemId = (Array.isArray(headerVal) ? headerVal[0] : headerVal) || config.defaultSystem;
  const system = config.systems.find((s: any) => s.id === systemId);

  if (!system) {
    throw new Error(`Unknown design system: ${systemId}`);
  }

  const docsDir = path.resolve(repoRoot, system.docsDir);
  const genDir = path.join(docsDir, "_generated");

  return {
    systemId,
    repoRoot,
    componentRegistryPath: path.join(genDir, "component-registry.json"),
    tokenRegistryPath: path.join(genDir, "token-registry.json"),
    tokenGraphVizPath: path.join(genDir, "token-graph.viz.json"),
    tokenUsageIndexPath: path.join(genDir, "token-usage-index.json"),
    tokenHealthPath: path.join(genDir, "token-health.json"),
    componentsHealthPath: path.join(genDir, "components-health.json"),
    healthHistoryPath: path.join(genDir, "health-history.json"),
    namingDebtCachePath: path.join(genDir, "naming-debt.json"),
    namingDebtConfigPath: path.join(repoRoot, "tooling", "config", "naming-debt.config.json"),
    wcagPairsPath: path.join(repoRoot, "tooling", "config", "wcag-pairs.json"),
    tokenDiffScriptPath: path.join(repoRoot, "tooling", "scripts", "ds-token-diff.mjs"),
    healthSnapshotScriptPath: path.join(repoRoot, "tooling", "scripts", "ds-health-snapshot.mjs"),
    captureFromFigmaUrlScriptPath: path.join(repoRoot, "tooling", "scripts", "ds-capture-from-figma-url.mjs"),
    specBackupsDirPath: path.join(genDir, "spec-backups"),
    rawConfig: config
  };
}

function createLocalDataApi() {
  const middleware: Middleware = async (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    const requestUrl = new URL(String(req.url || ""), "http://localhost");
    const url = requestUrl.pathname;
    const searchParams = requestUrl.searchParams;

    if (!url.startsWith("/api/")) {
      return next();
    }

    const workspaceRoot = path.resolve(__dirname, "../..");
    const designSystemsRouteMatch = url.match(/^\/api\/design-systems(?:\/([^/]+))?$/);
    if (designSystemsRouteMatch) {
      try {
        const routeSystemId = designSystemsRouteMatch[1]
          ? decodeURIComponent(designSystemsRouteMatch[1])
          : "";
        const summarizeConfig = (config: any) => ({
          systems: (Array.isArray(config.systems) ? config.systems : []).map((system: any) => ({
            id: String(system.id || ""),
            name: String(system.name || ""),
          })),
          defaultSystem: String(config.defaultSystem || ""),
        });

        if (method === "GET") {
          const config = readDesignSystemsConfig(workspaceRoot);
          _cachedDesignSystemsConfig = config;
          sendJson(res, 200, config);
          return;
        }

        if (method === "POST") {
          const body = await readJsonBody(req);
          const config = readDesignSystemsConfig(workspaceRoot);
          const systemId = normalizeSystemId(body.id);
          const systemName = String(body.name || "").trim();
          if (!systemId || !systemName) {
            sendJson(res, 400, {
              ok: false,
              message: "Both `id` and `name` are required.",
            });
            return;
          }

          const exists = Array.isArray(config.systems)
            ? config.systems.some((row: any) => String(row?.id || "").trim() === systemId)
            : false;
          if (exists) {
            sendJson(res, 409, {
              ok: false,
              message: `System '${systemId}' already exists.`,
            });
            return;
          }

          const inputDir = ensureRelativeDir(body.inputDir, `input/${systemId}`);
          const outputDir = ensureRelativeDir(body.outputDir, `output/${systemId}`);
          const docsDir = ensureRelativeDir(body.docsDir, `docs/${systemId}`);
          const nextSystem = {
            id: systemId,
            name: systemName,
            appName: String(body.appName || "").trim() || systemName,
            figmaFileId: String(body.figmaFileId || "").trim(),
            figmaApiToken: normalizeFigmaApiTokenRef(
              body.figmaApiToken,
              `FIGMA_TOKEN_${systemId.toUpperCase().replace(/-/g, "_")}`,
            ),
            inputDir,
            outputDir,
            docsDir,
            collections: normalizeCollectionList(body.collections),
            compileVariablesOnCapture: body.compileVariablesOnCapture !== false,
          };

          const nextSystems = [...(Array.isArray(config.systems) ? config.systems : []), nextSystem];
          const makeDefault = body.makeDefault === true;
          const nextConfig = {
            ...config,
            systems: nextSystems,
            defaultSystem: makeDefault ? systemId : config.defaultSystem || systemId,
          };

          writeDesignSystemsConfig(workspaceRoot, nextConfig);
          _cachedDesignSystemsConfig = nextConfig;

          sendJson(res, 200, {
            ok: true,
            system: { id: nextSystem.id, name: nextSystem.name },
            config: summarizeConfig(nextConfig),
          });
          return;
        }

        if (method === "PUT" && routeSystemId) {
          const body = await readJsonBody(req);
          const config = readDesignSystemsConfig(workspaceRoot);
          const nextSystems = Array.isArray(config.systems) ? [...config.systems] : [];
          const targetIndex = nextSystems.findIndex(
            (row: any) => String(row?.id || "").trim() === routeSystemId,
          );
          if (targetIndex < 0) {
            sendJson(res, 404, {
              ok: false,
              message: `System '${routeSystemId}' not found.`,
            });
            return;
          }

          const current = nextSystems[targetIndex] || {};
          const normalizedName = String(body.name ?? current.name ?? "").trim();
          if (!normalizedName) {
            sendJson(res, 400, {
              ok: false,
              message: "System name cannot be empty.",
            });
            return;
          }

          const updated = {
            ...current,
            id: routeSystemId,
            name: normalizedName,
            appName: String(body.appName ?? current.appName ?? normalizedName).trim() || normalizedName,
            figmaFileId: String(body.figmaFileId ?? current.figmaFileId ?? "").trim(),
            figmaApiToken: normalizeFigmaApiTokenRef(body.figmaApiToken ?? current.figmaApiToken),
            inputDir: ensureRelativeDir(body.inputDir ?? current.inputDir, `input/${routeSystemId}`),
            outputDir: ensureRelativeDir(body.outputDir ?? current.outputDir, `output/${routeSystemId}`),
            docsDir: ensureRelativeDir(body.docsDir ?? current.docsDir, `docs/${routeSystemId}`),
            collections: normalizeCollectionList(
              body.collections ?? current.collections ?? [],
            ),
            compileVariablesOnCapture:
              body.compileVariablesOnCapture !== undefined
                ? body.compileVariablesOnCapture === true
                : current.compileVariablesOnCapture !== false,
          };

          nextSystems[targetIndex] = updated;
          const makeDefault = body.makeDefault === true;
          const nextConfig = {
            ...config,
            systems: nextSystems,
            defaultSystem: makeDefault ? routeSystemId : config.defaultSystem || routeSystemId,
          };
          writeDesignSystemsConfig(workspaceRoot, nextConfig);
          _cachedDesignSystemsConfig = nextConfig;
          sendJson(res, 200, {
            ok: true,
            system: { id: routeSystemId, name: updated.name },
            config: summarizeConfig(nextConfig),
          });
          return;
        }

        if (method === "DELETE" && routeSystemId) {
          const config = readDesignSystemsConfig(workspaceRoot);
          const currentSystems = Array.isArray(config.systems) ? config.systems : [];
          const targetSystem = currentSystems.find(
            (row: any) => String(row?.id || "").trim() === routeSystemId,
          );
          const nextSystems = currentSystems.filter(
            (row: any) => String(row?.id || "").trim() !== routeSystemId,
          );
          if (nextSystems.length === (Array.isArray(config.systems) ? config.systems.length : 0)) {
            sendJson(res, 404, {
              ok: false,
              message: `System '${routeSystemId}' not found.`,
            });
            return;
          }
          if (nextSystems.length === 0) {
            sendJson(res, 400, {
              ok: false,
              message: "Cannot delete the last design system.",
            });
            return;
          }

          const nextDefault =
            config.defaultSystem === routeSystemId
              ? String(nextSystems[0]?.id || "")
              : String(config.defaultSystem || nextSystems[0]?.id || "");
          const nextConfig = {
            ...config,
            systems: nextSystems,
            defaultSystem: nextDefault,
          };

          const removedPaths = targetSystem
            ? resolveSafeSystemPathsForDeletion(targetSystem, workspaceRoot)
            : [];
          for (const targetPath of removedPaths) {
            if (!fsSync.existsSync(targetPath)) continue;
            fsSync.rmSync(targetPath, { recursive: true, force: true });
          }

          writeDesignSystemsConfig(workspaceRoot, nextConfig);
          _cachedDesignSystemsConfig = nextConfig;
          sendJson(res, 200, {
            ok: true,
            removedPaths,
            config: summarizeConfig(nextConfig),
          });
          return;
        }

        sendJson(res, 405, {
          ok: false,
          message: "Method not allowed for /api/design-systems.",
        });
        return;
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    let sysCtx;
    try {
      sysCtx = getSystemContextParams(req);
    } catch (err: any) {
      sendJson(res, 400, { ok: false, message: err.message });
      return;
    }

    const {
      systemId,
      repoRoot,
      componentRegistryPath,
      tokenRegistryPath,
      tokenGraphVizPath,
      tokenUsageIndexPath,
      tokenHealthPath,
      componentsHealthPath,
      healthHistoryPath,
      namingDebtCachePath,
      namingDebtConfigPath,
      wcagPairsPath,
      tokenDiffScriptPath,
      healthSnapshotScriptPath,
      captureFromFigmaUrlScriptPath,
      specBackupsDirPath
    } = sysCtx;

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

      if (method === "GET" && url === "/api/health-history") {
        const range = normalizeHealthHistoryRange(searchParams.get("range"));
        const raw = await fs.readFile(healthHistoryPath, "utf8").catch(() => "");
        const parsed = normalizeHealthHistoryPayload(raw ? JSON.parse(raw) : null);
        const snapshots = filterSnapshotsByRange(parsed.snapshots, range);
        sendJson(res, 200, {
          ...parsed,
          snapshots,
          summary: {
            snapshots_total: snapshots.length,
            latest_at: snapshots.length ? snapshots[snapshots.length - 1].captured_at : null,
          },
          range,
        });
        return;
      }

      if (method === "GET" && url === "/api/naming-debt") {
        const refresh = String(searchParams.get("refresh") ?? "false").trim() === "true";
        if (!refresh) {
          const cached = await fs.readFile(namingDebtCachePath, "utf8").catch(() => "");
          if (cached.trim()) {
            sendJson(res, 200, JSON.parse(cached));
            return;
          }
        }

        const report = await computeNamingDebtReport({
          tokenRegistryPath,
          tokenUsageIndexPath,
          tokenGraphVizPath,
          namingDebtConfigPath,
        });
        await fs.mkdir(path.dirname(namingDebtCachePath), { recursive: true });
        await fs.writeFile(namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        sendJson(res, 200, report);
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

      if (method === "GET" && url === "/api/impact") {
        const tokenPath = String(searchParams.get("tokenPath") ?? "").trim();
        if (!tokenPath) {
          sendJson(res, 400, { ok: false, message: "tokenPath query param is required." });
          return;
        }

        const newValueRaw = searchParams.get("newValue");
        const newValue = newValueRaw ? String(newValueRaw).trim() : null;
        const depthRaw = searchParams.get("depth");
        const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
        const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;

        const [
          tokenRegistryRaw,
          tokenGraphRaw,
          tokenUsageRaw,
          tokenHealthRaw,
          componentRegistryRaw,
          wcagPairsRaw,
        ] = await Promise.all([
          fs.readFile(tokenRegistryPath, "utf8"),
          fs.readFile(tokenGraphVizPath, "utf8"),
          fs.readFile(tokenUsageIndexPath, "utf8"),
          fs.readFile(tokenHealthPath, "utf8").catch(() => "null"),
          fs.readFile(componentRegistryPath, "utf8").catch(() => "null"),
          fs.readFile(wcagPairsPath, "utf8").catch(() => '{"pairs": []}'),
        ]);

        try {
          const report = computeImpactReport({
            tokenPath,
            newValue,
            depth,
            tokenRegistry: JSON.parse(tokenRegistryRaw),
            tokenGraph: JSON.parse(tokenGraphRaw),
            tokenUsageIndex: JSON.parse(tokenUsageRaw),
            tokenHealth: JSON.parse(tokenHealthRaw),
            componentRegistry: JSON.parse(componentRegistryRaw),
            wcagPairs: normalizeImpactWcagPairs(JSON.parse(wcagPairsRaw)),
          });
          sendJson(res, 200, report);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const notFound = message.includes("not found");
          sendJson(res, notFound ? 404 : 400, { ok: false, message });
          return;
        }
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
        const slug = sanitizeSlug(decodeURIComponent(String(specMatch[1])));
        if (!slug) {
          sendJson(res, 400, { ok: false, message: "Invalid component slug." });
          return;
        }

        const target = await resolveComponentSpecTarget({
          repoRoot,
          componentRegistryPath,
          slug,
        });
        if (!target.ok) {
          sendJson(res, 404, { ok: false, message: target.message });
          return;
        }

        let raw = "";
        let exists = true;
        try {
          raw = await fs.readFile(target.specAbsPath, "utf8");
        } catch (error) {
          const code =
            typeof error === "object" &&
              error &&
              "code" in error
              ? String((error as { code?: string }).code || "")
              : "";
          if (code === "ENOENT") {
            exists = false;
            raw = "";
          } else {
            throw error;
          }
        }

        const parsedPayload = parseYamlSafely(raw);
        sendJson(res, 200, {
          ok: true,
          slug,
          path: target.specRelPath,
          exists,
          raw,
          rawHash: exists ? sha256Text(raw) : null,
          parsed: parsedPayload.parsed,
          parseError: parsedPayload.parseError,
        });
        return;
      }

      const validateSpecMatch =
        method === "POST" && url.match(/^\/api\/component-spec\/([^/]+)\/validate$/);
      if (validateSpecMatch) {
        if (!isDevRuntime()) {
          sendJson(res, 403, { ok: false, message: "Spec editing is only enabled in development mode." });
          return;
        }

        const slug = sanitizeSlug(decodeURIComponent(String(validateSpecMatch[1])));
        if (!slug) {
          sendJson(res, 400, { ok: false, message: "Invalid component slug." });
          return;
        }

        const target = await resolveComponentSpecTarget({
          repoRoot,
          componentRegistryPath,
          slug,
        });
        if (!target.ok) {
          sendJson(res, 404, { ok: false, message: target.message });
          return;
        }

        const body = await readJsonBody(req);
        const raw = String(body.raw ?? "");
        if (!raw.trim()) {
          sendJson(res, 200, {
            ok: true,
            slug,
            path: target.specRelPath,
            rawHash: null,
            parsed: null,
            validation: {
              valid: false,
              blockingIssueCount: 1,
              warningCount: 0,
              issues: [
                {
                  severity: "error",
                  code: "SPEC_EMPTY",
                  path: "$",
                  message: "Spec content cannot be empty.",
                },
              ],
            },
            diff: [],
          });
          return;
        }
        if (Buffer.byteLength(raw, "utf8") > MAX_SPEC_BYTES) {
          sendJson(res, 200, {
            ok: true,
            slug,
            path: target.specRelPath,
            rawHash: null,
            parsed: null,
            validation: {
              valid: false,
              blockingIssueCount: 1,
              warningCount: 0,
              issues: [
                {
                  severity: "error",
                  code: "SPEC_TOO_LARGE",
                  path: "$",
                  message: `Spec exceeds ${MAX_SPEC_BYTES} bytes.`,
                },
              ],
            },
            diff: [],
          });
          return;
        }

        let currentRaw = "";
        try {
          currentRaw = await fs.readFile(target.specAbsPath, "utf8");
        } catch {
          currentRaw = "";
        }
        const baselineParsed = parseYamlSafely(currentRaw).parsed;
        const tokenRegistryRaw = await fs.readFile(tokenRegistryPath, "utf8").catch(() => "");
        const tokenRegistry = tokenRegistryRaw
          ? (JSON.parse(tokenRegistryRaw) as TokenRegistry)
          : null;

        const payload = buildSpecValidationPayload({
          slug,
          path: target.specRelPath,
          raw,
          baselineParsed,
          tokenRegistry,
        });
        sendJson(res, 200, payload);
        return;
      }

      const saveSpecMatch = method === "POST" && url.match(/^\/api\/component-spec\/([^/]+)\/save$/);
      if (saveSpecMatch) {
        if (!isDevRuntime()) {
          sendJson(res, 403, { ok: false, message: "Spec editing is only enabled in development mode." });
          return;
        }

        const slug = sanitizeSlug(decodeURIComponent(String(saveSpecMatch[1])));
        if (!slug) {
          sendJson(res, 400, { ok: false, message: "Invalid component slug." });
          return;
        }

        const target = await resolveComponentSpecTarget({
          repoRoot,
          componentRegistryPath,
          slug,
        });
        if (!target.ok) {
          sendJson(res, 404, { ok: false, message: target.message });
          return;
        }

        const body = await readJsonBody(req);
        const raw = String(body.raw ?? "");
        const expectedHash =
          body.expectedHash === null || body.expectedHash === undefined
            ? null
            : String(body.expectedHash).trim() || null;
        const refreshRegistryAfterSave = body.refreshRegistry !== false;
        const confirmRiskyChanges = body.confirmRiskyChanges === true;

        if (!raw.trim()) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            rawHash: null,
            backupPath: null,
            parsed: null,
            validation: {
              valid: false,
              blockingIssueCount: 1,
              warningCount: 0,
              issues: [
                {
                  severity: "error",
                  code: "SPEC_EMPTY",
                  path: "$",
                  message: "Spec content cannot be empty.",
                },
              ],
            },
            diff: [],
            message: "Spec content cannot be empty.",
          });
          return;
        }

        if (Buffer.byteLength(raw, "utf8") > MAX_SPEC_BYTES) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            rawHash: null,
            backupPath: null,
            parsed: null,
            validation: {
              valid: false,
              blockingIssueCount: 1,
              warningCount: 0,
              issues: [
                {
                  severity: "error",
                  code: "SPEC_TOO_LARGE",
                  path: "$",
                  message: `Spec exceeds ${MAX_SPEC_BYTES} bytes.`,
                },
              ],
            },
            diff: [],
            message: `Spec exceeds ${MAX_SPEC_BYTES} bytes.`,
          });
          return;
        }

        let currentRaw = "";
        let currentExists = true;
        try {
          currentRaw = await fs.readFile(target.specAbsPath, "utf8");
        } catch (error) {
          const code =
            typeof error === "object" &&
              error &&
              "code" in error
              ? String((error as { code?: string }).code || "")
              : "";
          if (code === "ENOENT") {
            currentRaw = "";
            currentExists = false;
          } else {
            throw error;
          }
        }

        const currentHash = currentExists ? sha256Text(currentRaw) : null;
        if (expectedHash && expectedHash !== currentHash) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            rawHash: currentHash,
            backupPath: null,
            parsed: null,
            validation: {
              valid: false,
              blockingIssueCount: 1,
              warningCount: 0,
              issues: [
                {
                  severity: "error",
                  code: "SPEC_CONFLICT",
                  path: "$",
                  message:
                    "Spec file changed on disk since you opened the editor. Reload to merge latest content.",
                },
              ],
            },
            diff: [],
            message: "Spec file changed on disk; reload before saving.",
          });
          return;
        }

        const baselineParsed = parseYamlSafely(currentRaw).parsed;
        const tokenRegistryRaw = await fs.readFile(tokenRegistryPath, "utf8").catch(() => "");
        const tokenRegistry = tokenRegistryRaw
          ? (JSON.parse(tokenRegistryRaw) as TokenRegistry)
          : null;

        const validationPayload = buildSpecValidationPayload({
          slug,
          path: target.specRelPath,
          raw,
          baselineParsed,
          tokenRegistry,
        });

        if (!validationPayload.validation.valid) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            rawHash: currentHash,
            backupPath: null,
            parsed: validationPayload.parsed,
            validation: validationPayload.validation,
            diff: validationPayload.diff,
            message: "Spec has validation errors.",
          });
          return;
        }

        const requiresConfirmation = validationPayload.validation.issues.some(
          (issue) => issue.requiresConfirmation === true,
        );
        if (requiresConfirmation && !confirmRiskyChanges) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            rawHash: currentHash,
            backupPath: null,
            parsed: validationPayload.parsed,
            validation: validationPayload.validation,
            diff: validationPayload.diff,
            requiresConfirmation: true,
            message: "This change includes risky fields and requires explicit confirmation.",
          });
          return;
        }

        await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
        await fs.mkdir(specBackupsDirPath, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupTimestampPath = path.join(specBackupsDirPath, `${slug}.${timestamp}.yml`);
        const backupLatestPath = path.join(specBackupsDirPath, `${slug}.last.yml`);
        const backupContent = currentExists ? currentRaw : "";
        await fs.writeFile(backupTimestampPath, backupContent, "utf8");
        await fs.writeFile(backupLatestPath, backupContent, "utf8");

        const tempPath = `${target.specAbsPath}.tmp-${Date.now()}`;
        await fs.writeFile(tempPath, raw, "utf8");
        await fs.rename(tempPath, target.specAbsPath);

        let refreshed = false;
        let refreshOutput = "";
        if (refreshRegistryAfterSave) {
          const refresh = await runCommandCapture({
            cwd: repoRoot,
            command: "npm",
            commandArgs: ["run", "ds:registry:refresh"],
          });
          refreshed = refresh.ok;
          refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
          if (!refresh.ok) {
            sendJson(res, 200, {
              ok: false,
              slug,
              path: target.specRelPath,
              rawHash: sha256Text(raw),
              backupPath: path.relative(repoRoot, backupLatestPath),
              parsed: validationPayload.parsed,
              validation: validationPayload.validation,
              diff: validationPayload.diff,
              refreshed,
              refreshOutput,
              message: "Spec saved, but registry refresh failed.",
            });
            return;
          }
        }

        sendJson(res, 200, {
          ok: true,
          slug,
          path: target.specRelPath,
          rawHash: sha256Text(raw),
          backupPath: path.relative(repoRoot, backupLatestPath),
          parsed: validationPayload.parsed,
          validation: validationPayload.validation,
          diff: validationPayload.diff,
          refreshed,
          refreshOutput,
          message: "Spec saved successfully.",
        });
        return;
      }

      const restoreSpecMatch =
        method === "POST" && url.match(/^\/api\/component-spec\/([^/]+)\/restore-backup$/);
      if (restoreSpecMatch) {
        if (!isDevRuntime()) {
          sendJson(res, 403, { ok: false, message: "Spec editing is only enabled in development mode." });
          return;
        }

        const slug = sanitizeSlug(decodeURIComponent(String(restoreSpecMatch[1])));
        if (!slug) {
          sendJson(res, 400, { ok: false, message: "Invalid component slug." });
          return;
        }

        const target = await resolveComponentSpecTarget({
          repoRoot,
          componentRegistryPath,
          slug,
        });
        if (!target.ok) {
          sendJson(res, 404, { ok: false, message: target.message });
          return;
        }

        const body = await readJsonBody(req);
        const refreshRegistryAfterRestore = body.refreshRegistry !== false;
        const backupLatestPath = path.join(specBackupsDirPath, `${slug}.last.yml`);
        const backupExists = await fs
          .stat(backupLatestPath)
          .then((stat) => stat.isFile())
          .catch(() => false);
        if (!backupExists) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            restoredFrom: null,
            rawHash: null,
            message: "No backup file found for this component.",
          });
          return;
        }

        const backupRaw = await fs.readFile(backupLatestPath, "utf8");
        if (!backupRaw.trim()) {
          sendJson(res, 200, {
            ok: false,
            slug,
            path: target.specRelPath,
            restoredFrom: path.relative(repoRoot, backupLatestPath),
            rawHash: null,
            message: "Backup exists but is empty; restore skipped.",
          });
          return;
        }

        await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
        const tempPath = `${target.specAbsPath}.tmp-restore-${Date.now()}`;
        await fs.writeFile(tempPath, backupRaw, "utf8");
        await fs.rename(tempPath, target.specAbsPath);

        let refreshed = false;
        let refreshOutput = "";
        if (refreshRegistryAfterRestore) {
          const refresh = await runCommandCapture({
            cwd: repoRoot,
            command: "npm",
            commandArgs: ["run", "ds:registry:refresh"],
          });
          refreshed = refresh.ok;
          refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
        }

        sendJson(res, 200, {
          ok: true,
          slug,
          path: target.specRelPath,
          restoredFrom: path.relative(repoRoot, backupLatestPath),
          rawHash: sha256Text(backupRaw),
          refreshed,
          refreshOutput,
          message: "Spec restored from latest backup.",
        });
        return;
      }

      if (method === "POST" && url?.startsWith("/api/run/")) {
        const scriptName = url.replace("/api/run/", "").trim();
        if (!scriptName) {
          sendJson(res, 400, { ok: false, message: "Missing script name in URL." });
          return;
        }

        let bodyParams: Record<string, any> = {};
        try {
          bodyParams = await readJsonBody(req);
        } catch (e) { /* ignore empty body */ }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Parse common args mapping for ds:pipeline
        const args: string[] = ["run", scriptName, "--", "--system", systemId];
        if (scriptName === "ds:pipeline") {
          if (bodyParams.all) args.push("--all");
          if (bodyParams.component) {
            args.push("--component");
            args.push(bodyParams.component);
          }
          if (bodyParams.fromStep) {
            args.push("--from-step");
            args.push(bodyParams.fromStep);
          }
          if (bodyParams.dryRun) args.push("--status-only"); // or dry-run equivalent
        }

        const child = spawn("npm", args, {
          cwd: repoRoot,
          shell: false,
        });

        const writeChunk = (type: string, text: string) => {
          // SSE format
          const payload = JSON.stringify({ type, text });
          // in nodehttp: res is ServerResponse
          (res as any).write(`data: ${payload}\n\n`);
        };

        const writeEnd = (code: number) => {
          const payload = JSON.stringify({ type: "end", code });
          (res as any).write(`data: ${payload}\n\n`);
          res.end("");
        };

        child.stdout.on("data", (chunk) => {
          writeChunk("chunk", String(chunk));
        });
        child.stderr.on("data", (chunk) => {
          writeChunk("chunk", String(chunk)); // we stream stderr as chunk too so UI sees it
        });

        child.on("error", (error) => {
          const payload = JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) });
          (res as any).write(`data: ${payload}\n\n`);
          res.end("");
        });

        child.on("close", (code) => {
          writeEnd(code ?? 1);
        });

        req.on("close", () => {
          child.kill();
        });
        return;
      }

      if (method === "POST" && url === "/api/refresh-registry") {
        runNpmScript({ repoRoot, res, script: "ds:registry:refresh", systemId });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-usage-index") {
        runNpmScript({ repoRoot, res, script: "ds:token-usage-index", systemId });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-graph") {
        runNpmScript({ repoRoot, res, script: "ds:token-graph", systemId });
        return;
      }

      if (method === "POST" && url === "/api/refresh-token-health") {
        runNpmScript({ repoRoot, res, script: "ds:token-health", systemId });
        return;
      }

      if (method === "POST" && url === "/api/refresh-components-health") {
        runNpmScript({ repoRoot, res, script: "ds:registry:report", systemId });
        return;
      }

      if (method === "POST" && url === "/api/refresh-naming-debt") {
        const report = await computeNamingDebtReport({
          tokenRegistryPath,
          tokenUsageIndexPath,
          tokenGraphVizPath,
          namingDebtConfigPath,
        });
        await fs.mkdir(path.dirname(namingDebtCachePath), { recursive: true });
        await fs.writeFile(namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        sendJson(res, 200, {
          ok: true,
          generatedAt: report.generatedAt,
          totalViolations: report.summary.totalViolations,
          overallScore: report.summary.overallScore,
        });
        return;
      }

      if (method === "POST" && url === "/api/capture-health-snapshot") {
        const body = await readJsonBody(req);
        const beforeRefRaw = String(body.beforeRef ?? "HEAD~1").trim();
        const beforeRef = validateGitRef(beforeRefRaw);
        if (!beforeRef) {
          sendJson(res, 400, {
            ok: false,
            message:
              "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
          });
          return;
        }

        const retentionDaysRaw = Number(body.retentionDays);
        const retentionDays =
          Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
            ? String(Math.floor(retentionDaysRaw))
            : "120";

        const skipDiff = toBooleanString(body.skipDiff, false);

        runNodeJsonCommand({
          repoRoot,
          res,
          commandLabel:
            `node tooling/scripts/ds-health-snapshot.mjs --before-ref ${beforeRef} ` +
            `--retention-days ${retentionDays} --skip-diff ${skipDiff}`,
          scriptPath: healthSnapshotScriptPath,
          systemId,
          scriptArgs: [
            "--before-ref",
            beforeRef,
            "--retention-days",
            retentionDays,
            "--skip-diff",
            skipDiff,
            "--format",
            "json",
          ],
        });
        return;
      }

      if (method === "POST" && url === "/api/capture-figma-screenshot") {
        const body = await readJsonBody(req);
        const figmaUrl = String(body.figmaUrl ?? body.url ?? "").trim();
        if (!figmaUrl) {
          sendJson(res, 400, {
            ok: false,
            message: "figmaUrl is required in request body.",
          });
          return;
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(figmaUrl);
        } catch {
          sendJson(res, 400, { ok: false, message: "Invalid figmaUrl." });
          return;
        }
        const host = String(parsedUrl.hostname || "").toLowerCase();
        if (!host.endsWith("figma.com")) {
          sendJson(res, 400, {
            ok: false,
            message: `URL host is not figma.com: ${host}`,
          });
          return;
        }

        const componentSlug = String(body.componentSlug ?? "").trim().toLowerCase();
        const figmaToken = String(body.figmaToken ?? "").trim();
        const includeVariants = toBooleanString(body.includeVariants, true);
        const requireExistingDoc = toBooleanString(body.requireExistingDoc, true);
        const continueOnError = toBooleanString(body.continueOnError, true);
        const refreshIndices = toBooleanString(body.refreshIndices, true);
        const dryRun = toBooleanString(body.dryRun, false);
        const variantLimit = toNumberString(body.variantLimit, 6);
        const scale = toNumberString(body.scale, 2);
        const format = String(body.format ?? "png").trim().toLowerCase() || "png";
        const mainCaptureMode =
          String(body.mainCaptureMode ?? "rest").trim().toLowerCase() || "rest";
        const componentKind =
          String(body.componentKind ?? "component_set")
            .trim()
            .toLowerCase() || "component_set";
        const commandArgs = [
          "--url",
          figmaUrl,
          "--include-variants",
          includeVariants,
          "--variant-limit",
          variantLimit,
          "--require-existing-doc",
          requireExistingDoc,
          "--continue-on-error",
          continueOnError,
          "--refresh-indices",
          refreshIndices,
          "--dry-run",
          dryRun,
          "--scale",
          scale,
          "--format",
          format,
          "--main-capture-mode",
          mainCaptureMode,
          "--component-kind",
          componentKind,
        ];
        if (componentSlug) {
          commandArgs.push("--component-slug", componentSlug);
        }
        if (figmaToken) {
          commandArgs.push("--figma-token", figmaToken);
        }

        const commandDisplayArgs = [...commandArgs];
        const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
        if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
          commandDisplayArgs[tokenIdx + 1] = "***redacted***";
        }

        runNodeJsonCommand({
          repoRoot,
          res,
          commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${commandDisplayArgs.join(
            " ",
          )}`,
          scriptPath: captureFromFigmaUrlScriptPath,
          systemId,
          scriptArgs: commandArgs,
          allowNonZeroJson: true,
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

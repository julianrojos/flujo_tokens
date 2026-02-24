import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

import yaml from "js-yaml";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { computeImpactReport } from "../src/lib/impact.ts";
import { analyzeNamingDebt } from "../src/lib/naming-debt.ts";
import { buildSpecDiff } from "../src/lib/spec-diff.ts";
import { validateComponentSpec } from "../src/lib/spec-validator.ts";
import {
  createDesignSystemRepository,
  ensureRelativeDir,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  normalizeSystemId,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from "./system-repository.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const PORT = Number.parseInt(String(process.env.DS_DASHBOARD_API_PORT || "8787"), 10) || 8787;
const designSystemRepository = createDesignSystemRepository({ repoRoot, watch: true });
let designSystemRepositoryDisposed = false;

function disposeDesignSystemRepository() {
  if (designSystemRepositoryDisposed) return;
  designSystemRepositoryDisposed = true;
  designSystemRepository.dispose();
}

function handleProcessShutdown(signal) {
  disposeDesignSystemRepository();
  // eslint-disable-next-line no-console
  console.log(`[ds-dashboard-api] received ${signal}, shutting down`);
  process.exit(0);
}

process.once("SIGINT", () => handleProcessShutdown("SIGINT"));
process.once("SIGTERM", () => handleProcessShutdown("SIGTERM"));

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_FILE_BYTES = 450_000;
const MAX_SNIPPET_LINES = 15;
const MAX_SPEC_BYTES = 100_000;
const COMPONENT_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const JOB_QUEUE_CONCURRENCY = 1;
const JOB_TIMEOUT_MS =
  Number.parseInt(String(process.env.DS_DASHBOARD_JOB_TIMEOUT_MS || "600000"), 10) || 600000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const MAX_RETAINED_EVENTS = 2_000;
const MAX_RETAINED_JOBS = 200;

/** @type {Map<string, any>} */
const queueJobs = new Map();
/** @type {string[]} */
const queuePendingIds = [];
let queueActiveCount = 0;

function queueMetrics() {
  return {
    active: queueActiveCount,
    pending: queuePendingIds.length,
    total: queueJobs.size,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function createQueueJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isQueueJobFinalStatus(status) {
  return status === "success" || status === "error" || status === "cancelled";
}

function appendQueueJobEvent(job, event) {
  const fullEvent = {
    ...event,
    seq: job.nextSeq,
    at: nowIso(),
  };
  job.nextSeq += 1;
  job.events.push(fullEvent);
  if (job.events.length > MAX_RETAINED_EVENTS) {
    job.events.splice(0, job.events.length - MAX_RETAINED_EVENTS);
  }
  job.emitter.emit("event", fullEvent);
  return fullEvent;
}

function queueJobSnapshot(job) {
  return {
    id: job.id,
    label: job.label,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    systemId: job.systemId,
    result: job.result,
  };
}

function queueJobAcceptedPayload(job) {
  return {
    ok: true,
    accepted: true,
    jobId: job.id,
    status: job.status,
    statusUrl: `/api/jobs/${job.id}`,
    streamUrl: `/api/jobs/${job.id}/stream`,
    job: queueJobSnapshot(job),
  };
}

function enqueueQueueJob({ label, systemId, execute }) {
  const job = {
    id: createQueueJobId(),
    label,
    systemId,
    status: "queued",
    createdAt: nowIso(),
    startedAt: undefined,
    finishedAt: undefined,
    result: undefined,
    process: undefined,
    events: [],
    nextSeq: 1,
    emitter: new EventEmitter(),
    execute,
  };

  queueJobs.set(job.id, job);
  queuePendingIds.push(job.id);
  appendQueueJobEvent(job, { type: "status", status: "queued" });
  scheduleQueueJobs();
  cleanupQueueJobs();
  return job;
}

function scheduleQueueJobs() {
  while (queueActiveCount < JOB_QUEUE_CONCURRENCY && queuePendingIds.length > 0) {
    const nextId = queuePendingIds.shift();
    if (!nextId) continue;
    const job = queueJobs.get(nextId);
    if (!job || job.status !== "queued") continue;
    void runQueueJob(job);
  }
}

async function runQueueJob(job) {
  queueActiveCount += 1;
  job.status = "running";
  job.startedAt = nowIso();
  appendQueueJobEvent(job, { type: "status", status: "running" });
  const timeoutMessage = `Job timed out after ${Math.round(JOB_TIMEOUT_MS / 1000)} seconds.`;
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    if (job.status !== "running" || didTimeout) return;
    didTimeout = true;
    appendQueueJobEvent(job, {
      type: "error",
      message: timeoutMessage,
    });
    if (job.process && !job.process.killed) {
      try {
        job.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, JOB_TIMEOUT_MS);

  try {
    const result = await job.execute({
      emitChunk: (kind, text) => {
        if (!text) return;
        appendQueueJobEvent(job, { type: "chunk", kind, text });
      },
      setProcess: (process) => {
        job.process = process;
      },
      isCancelled: () => job.status === "cancelled",
    });

    if (didTimeout) {
      job.status = "error";
      job.result = {
        ...result,
        ok: false,
        code: typeof result.code === "number" && result.code !== 0 ? result.code : 124,
        summary: timeoutMessage,
      };
      job.finishedAt = nowIso();
      appendQueueJobEvent(job, {
        type: "end",
        status: "error",
        code: job.result.code,
        summary: timeoutMessage,
        payload: job.result.payload,
      });
      return;
    }

    if (job.status === "cancelled") {
      const summary = result.summary || "Cancelled.";
      job.result = { ...result, ok: false, summary };
      job.finishedAt = nowIso();
      appendQueueJobEvent(job, {
        type: "end",
        status: "cancelled",
        code: typeof result.code === "number" ? result.code : 1,
        summary,
        payload: result.payload,
      });
      return;
    }

    job.status = result.ok ? "success" : "error";
    job.result = result;
    job.finishedAt = nowIso();
    appendQueueJobEvent(job, {
      type: "end",
      status: job.status,
      code: typeof result.code === "number" ? result.code : result.ok ? 0 : 1,
      summary: result.summary,
      payload: result.payload,
    });
  } catch (error) {
    const message = didTimeout
      ? timeoutMessage
      : error instanceof Error
        ? error.message
        : String(error);
    job.status = "error";
    job.result = {
      ok: false,
      code: didTimeout ? 124 : 1,
      summary: message || "Unknown queue error.",
    };
    job.finishedAt = nowIso();
    if (!didTimeout) {
      appendQueueJobEvent(job, {
        type: "error",
        message,
      });
    }
    appendQueueJobEvent(job, {
      type: "end",
      status: "error",
      code: didTimeout ? 124 : 1,
      summary: message || "Unknown queue error.",
    });
  } finally {
    clearTimeout(timeoutId);
    job.process = undefined;
    queueActiveCount = Math.max(0, queueActiveCount - 1);
    scheduleQueueJobs();
    cleanupQueueJobs();
  }
}

function cancelQueueJob(jobId) {
  const job = queueJobs.get(jobId);
  if (!job) return { ok: false, message: "Job not found." };
  if (isQueueJobFinalStatus(job.status)) return { ok: false, message: "Job is already finished." };

  if (job.status === "queued") {
    job.status = "cancelled";
    job.finishedAt = nowIso();
    const pendingIndex = queuePendingIds.findIndex((id) => id === jobId);
    if (pendingIndex >= 0) queuePendingIds.splice(pendingIndex, 1);
    job.result = {
      ok: false,
      code: 1,
      summary: "Cancelled before execution.",
    };
    appendQueueJobEvent(job, { type: "status", status: "cancelled" });
    appendQueueJobEvent(job, {
      type: "end",
      status: "cancelled",
      code: 1,
      summary: "Cancelled before execution.",
    });
    return { ok: true };
  }

  job.status = "cancelled";
  appendQueueJobEvent(job, { type: "status", status: "cancelled" });
  if (job.process && !job.process.killed) {
    job.process.kill("SIGTERM");
  }
  return { ok: true };
}

function listQueueJobEvents(job, args = {}) {
  const since = Number.isFinite(args.since) ? Number(args.since) : 0;
  const limit = Number.isFinite(args.limit) ? Math.max(1, Number(args.limit)) : 300;
  const filtered = job.events.filter((event) => event.seq > since);
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
}

function cleanupQueueJobs() {
  const now = Date.now();

  for (const [jobId, job] of Array.from(queueJobs.entries())) {
    if (!isQueueJobFinalStatus(job.status)) continue;
    const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : NaN;
    if (Number.isFinite(finishedAt) && now - finishedAt > JOB_RETENTION_MS) {
      queueJobs.delete(jobId);
    }
  }

  if (queueJobs.size <= MAX_RETAINED_JOBS) return;
  const removable = Array.from(queueJobs.values())
    .filter((job) => isQueueJobFinalStatus(job.status))
    .sort((a, b) => {
      const aTs = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
      const bTs = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
      return aTs - bTs;
    });
  while (queueJobs.size > MAX_RETAINED_JOBS && removable.length > 0) {
    const job = removable.shift();
    if (!job) break;
    queueJobs.delete(job.id);
  }
}

function toQueueSummaryFromPayload(payload, fallbackCode) {
  const row = payload && typeof payload === "object" ? payload : {};
  const topLevelMessage = String(row.message ?? "").trim();
  const topLevelError = String(row.error ?? "").trim();
  const sync = row.sync && typeof row.sync === "object" ? row.sync : null;
  const syncError = String(sync?.error ?? "").trim();
  const syncReason = String(sync?.reason ?? "").trim();
  const explicitCode = Number(row.code ?? row.exit_code ?? fallbackCode);
  const codeText = Number.isFinite(explicitCode) ? `Failed with code ${explicitCode}` : "Unknown error";
  return topLevelMessage || topLevelError || syncError || syncReason || codeText;
}

async function runQueuedSpawnCommand(args) {
  return await new Promise((resolve) => {
    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      shell: false,
    });
    args.registerProcess(child);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += text;
      args.emitChunk("stdout", text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += text;
      args.emitChunk("stderr", text);
    });

    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      resolve({
        ok: false,
        code: 1,
        summary: message || `Unable to start command: ${args.commandLabel}`,
        payload: {
          ok: false,
          command: args.commandLabel,
          message,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
      });
    });

    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1;

      if (args.parseJsonStdout) {
        const rawStdout = stdout.trim();
        let parsed = null;
        try {
          parsed = rawStdout ? JSON.parse(rawStdout) : {};
        } catch (error) {
          resolve({
            ok: false,
            code: exitCode,
            summary: "Command returned invalid JSON.",
            payload: {
              ok: false,
              command: args.commandLabel,
              message: "Command returned invalid JSON.",
              stdout: rawStdout,
              stderr: stderr.trim(),
              parse_error: error instanceof Error ? error.message : String(error),
              code: exitCode,
            },
          });
          return;
        }

        if (exitCode !== 0 && args.allowNonZeroJson) {
          const payload =
            parsed && typeof parsed === "object"
              ? {
                  ...parsed,
                  ok: false,
                  exit_code: exitCode,
                  stderr: stderr.trim() || undefined,
                }
              : {
                  ok: false,
                  exit_code: exitCode,
                  stderr: stderr.trim() || undefined,
                };
          resolve({
            ok: false,
            code: exitCode,
            summary: toQueueSummaryFromPayload(payload, exitCode),
            payload,
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            ok: false,
            code: exitCode,
            summary: `Failed with code ${exitCode}`,
            payload: {
              ok: false,
              command: args.commandLabel,
              code: exitCode,
              stdout: rawStdout,
              stderr: stderr.trim(),
            },
          });
          return;
        }

        const payload = parsed && typeof parsed === "object" ? parsed : {};
        const ok = payload.ok !== false;
        resolve({
          ok,
          code: ok ? 0 : 1,
          summary: ok
            ? String(payload.message ?? args.successSummary ?? "Completed successfully.")
            : toQueueSummaryFromPayload(payload, 1),
          payload,
        });
        return;
      }

      if (exitCode !== 0) {
        resolve({
          ok: false,
          code: exitCode,
          summary: `Failed with code ${exitCode}`,
          payload: {
            ok: false,
            command: args.commandLabel,
            code: exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          },
        });
        return;
      }

      resolve({
        ok: true,
        code: 0,
        summary: args.successSummary || "Completed successfully.",
        payload: {
          ok: true,
          command: args.commandLabel,
          output: stdout.trim(),
        },
      });
    });
  });
}

function toBooleanString(value, fallback) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "false") return normalized;
  }
  return fallback ? "true" : "false";
}

function toNumberString(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return String(fallback);
  if (max !== undefined && parsed > max) return String(max);
  return String(parsed);
}

function validateGitRef(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length > 140) return null;
  if (value.includes(":")) return null;
  if (/\s/.test(value)) return null;
  if (!/^[A-Za-z0-9._/~^-]+$/.test(value)) return null;
  return value;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveRepoFilePath(root, requestedPath) {
  const raw = String(requestedPath || "").trim();
  if (!raw) return null;
  const resolved = path.resolve(root, raw);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

async function readTextFileLimited(absPath, maxBytes) {
  const buffer = await fs.readFile(absPath);
  const truncated = buffer.byteLength > maxBytes;
  const sliced = truncated ? buffer.subarray(0, maxBytes) : buffer;
  return { content: sliced.toString("utf8"), truncated };
}

function findLineForQuery(content, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const before = content.slice(0, idx);
  return before.split("\n").length;
}

function buildSnippet(content, line, before, after) {
  const lines = content.split("\n");
  const target = clampInt(line, 1, Math.max(1, lines.length));
  const safeBefore = clampInt(before, 0, MAX_SNIPPET_LINES - 1);
  const safeAfter = clampInt(after, 0, MAX_SNIPPET_LINES - 1 - safeBefore);
  const startLine = clampInt(target - safeBefore, 1, target);
  const endLine = clampInt(target + safeAfter, target, lines.length);
  const snippetLines = lines.slice(startLine - 1, endLine);
  return { targetLine: target, startLine, endLine, snippet: snippetLines.join("\n") };
}

function buildTokenCollectionTrees(entries) {
  const byCollection = new Map();
  for (const entry of entries) {
    const collection = String(entry.collection || "Uncategorized").trim() || "Uncategorized";
    if (!byCollection.has(collection)) byCollection.set(collection, []);
    byCollection.get(collection)?.push(entry);
  }

  const collections = Array.from(byCollection.entries())
    .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .map(([collection, collectionEntries]) => {
      const root = {
        id: `collection:${collection}`,
        name: collection,
        type: "collection",
        path: collection,
        children: [],
      };
      const nodeByPath = new Map();
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
            const tokenNode = {
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

      const sortTree = (nodes) => {
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

function normalizeTokenGraphDirection(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "dependencies" || value === "dependents" || value === "both") return value;
  return "both";
}

function normalizeTokenGraphDepth(raw) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(parsed)) return 3;
  return clampInt(parsed, 0, 8);
}

function buildTokenGraphIndexes(graph) {
  const nodeById = new Map();
  for (const node of graph.nodes || []) nodeById.set(node.id, node);

  const outById = new Map();
  const inById = new Map();
  for (const node of graph.nodes || []) {
    outById.set(node.id, []);
    inById.set(node.id, []);
  }

  for (const edge of graph.edges || []) {
    if (outById.has(edge.source)) outById.get(edge.source)?.push(edge.target);
    if (inById.has(edge.target)) inById.get(edge.target)?.push(edge.source);
  }

  for (const [id, list] of outById) outById.set(id, Array.from(new Set(list)));
  for (const [id, list] of inById) inById.set(id, Array.from(new Set(list)));

  return { nodeById, outById, inById };
}

function resolveTokenGraphNodeId(graph, query) {
  const q = String(query || "").trim();
  if (!q) return null;

  const indexes = buildTokenGraphIndexes(graph);
  if (indexes.nodeById.has(q)) return q;

  const lowered = q.toLowerCase();
  for (const node of graph.nodes || []) {
    if (String(node.path || "").toLowerCase() === lowered) return node.id;
    if (String(node.slashPath || "").toLowerCase() === lowered) return node.id;
    if (String(node.cssVar || "").toLowerCase() === lowered) return node.id;
    if (String(node.displayKey || "").toLowerCase() === lowered) return node.id;
  }

  return null;
}

function buildTokenGraphQueryPayload({ graph, token, direction, depth }) {
  const indexes = buildTokenGraphIndexes(graph);
  const rootId = resolveTokenGraphNodeId(graph, token);
  if (!rootId) return null;

  const root = indexes.nodeById.get(rootId);
  if (!root) return null;

  const collectReachable = (neighborsFor) => {
    const visited = new Set();
    const queue = [{ id: rootId, level: 0 }];
    const seen = new Set([rootId]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.level >= depth) continue;

      for (const nextId of neighborsFor(current.id)) {
        if (!indexes.nodeById.has(nextId) || seen.has(nextId)) continue;
        seen.add(nextId);
        visited.add(nextId);
        queue.push({ id: nextId, level: current.level + 1 });
      }
    }

    return visited;
  };

  const toRef = (node) => ({
    id: node.id,
    path: node.path,
    slashPath: node.slashPath,
    cssVar: node.cssVar,
    displayKey: node.displayKey,
    type: node.type,
    collection: node.collection,
    isCycleMember: node.isCycleMember,
  });

  const sortNodes = (ids) =>
    ids
      .map((id) => indexes.nodeById.get(id))
      .filter(Boolean)
      .sort((a, b) =>
        String(a?.displayKey || "").localeCompare(String(b?.displayKey || ""), "en", {
          sensitivity: "base",
        }),
      )
      .map((node) => toRef(node));

  const directDependencies = indexes.outById.get(rootId) ?? [];
  const directDependents = indexes.inById.get(rootId) ?? [];

  const dependencySet =
    direction === "dependents"
      ? new Set()
      : collectReachable((id) => indexes.outById.get(id) ?? []);
  const dependentSet =
    direction === "dependencies"
      ? new Set()
      : collectReachable((id) => indexes.inById.get(id) ?? []);

  const subgraphVisited = new Set([rootId]);
  for (const id of dependencySet) subgraphVisited.add(id);
  for (const id of dependentSet) subgraphVisited.add(id);

  const subgraphNodes = sortNodes(Array.from(subgraphVisited));
  const subgraphEdges = (graph.edges || []).filter(
    (edge) => subgraphVisited.has(edge.source) && subgraphVisited.has(edge.target),
  );

  return {
    ok: true,
    query: {
      token,
      direction,
      depth,
      resolved_id: rootId,
    },
    root: toRef(root),
    summary: {
      direct_dependencies: directDependencies.length,
      direct_dependents: directDependents.length,
      transitive_dependencies: dependencySet.size,
      transitive_dependents: dependentSet.size,
      subgraph_nodes: subgraphNodes.length,
      subgraph_edges: subgraphEdges.length,
    },
    direct: {
      dependencies: sortNodes(directDependencies),
      dependents: sortNodes(directDependents),
    },
    transitive: {
      dependencies: sortNodes(Array.from(dependencySet)),
      dependents: sortNodes(Array.from(dependentSet)),
    },
    subgraph: {
      nodes: subgraphNodes,
      edges: subgraphEdges,
    },
  };
}

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-./]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function singularizeSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (normalized.endsWith("ies") && normalized.length > 3) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 1) return normalized.slice(0, -1);
  return normalized;
}

function extractExplicitRelatedComponents(rawSpec) {
  const blockMatch = String(rawSpec || "").match(
    /^related_components:\s*\n((?:[ \t]*-\s*[^\n]+\n?)*)/m,
  );
  if (!blockMatch) return [];

  const rows = String(blockMatch[1] || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  return rows
    .map((line) => line.replace(/^- /, "").trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .map((item) => normalizeSlug(item));
}

function extractAnatomyItemRefs(rawSpec) {
  const refs = new Set();
  const text = String(rawSpec || "");
  const idRegex = /^\s*-\s*id:\s*([A-Za-z0-9_-]+)\s*$/gm;
  let idMatch = null;
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
  let instanceMatch = null;
  while ((instanceMatch = instanceRegex.exec(text)) !== null) {
    const token = normalizeSlug(String(instanceMatch[1] || ""));
    if (token) {
      refs.add(token);
      refs.add(singularizeSlug(token));
    }
  }

  return Array.from(refs);
}

function buildComponentUsageIndex(rows, root) {
  const slugSet = new Set(rows.map((row) => normalizeSlug(String(row.slug || ""))).filter(Boolean));
  const usesMap = new Map();
  for (const slug of Array.from(slugSet)) usesMap.set(slug, new Set());

  for (const row of rows) {
    const ownerSlug = normalizeSlug(String(row.slug || ""));
    if (!ownerSlug || !usesMap.has(ownerSlug)) continue;
    const specRelPath = String(row.paths?.spec || "").trim();
    if (!specRelPath) continue;
    const specPath = path.resolve(root, specRelPath);

    let rawSpec = "";
    try {
      rawSpec = fsSync.readFileSync(specPath, "utf8");
    } catch {
      continue;
    }

    const refs = new Set([
      ...extractExplicitRelatedComponents(rawSpec),
      ...extractAnatomyItemRefs(rawSpec),
    ]);
    for (const ref of Array.from(refs)) {
      const normalized = normalizeSlug(ref);
      const singular = singularizeSlug(normalized);
      const finalRef = slugSet.has(normalized) ? normalized : slugSet.has(singular) ? singular : "";
      if (!finalRef || finalRef === ownerSlug) continue;
      usesMap.get(ownerSlug)?.add(finalRef);
    }
  }

  const usedInMap = new Map();
  for (const slug of Array.from(slugSet)) usedInMap.set(slug, new Set());

  for (const [ownerSlug, uses] of Array.from(usesMap.entries())) {
    for (const targetSlug of Array.from(uses)) {
      usedInMap.get(targetSlug)?.add(ownerSlug);
    }
  }

  const bySlug = {};
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

  return { by_slug: bySlug };
}

function buildEmptyTokenHealthReport(args) {
  const warnings = args.reason ? [{ id: "bootstrap-missing", message: String(args.reason) }] : [];
  return {
    ok: false,
    bootstrapped: true,
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      registry_path: args.tokenRegistryPath,
      usage_index_path: args.tokenUsageIndexPath,
      graph_viz_path: args.tokenGraphVizPath,
      wcag_pairs_path: args.wcagPairsPath,
    },
    thresholds: {
      high_usage_threshold: 25,
      high_indegree_threshold: 15,
    },
    summary: {
      tokens_total: 0,
      tokens_with_usage: 0,
      unused_tokens_total: 0,
      high_coupling_tokens_total: 0,
      broken_aliases_total: 0,
      broken_css_var_refs_total: 0,
      cycle_nodes_total: 0,
      wcag_pairs_configured_total: 0,
      wcag_pairs_resolved_total: 0,
      wcag_failures_total: 0,
    },
    warnings,
    unused_tokens: { items: [], total: 0, truncated: false },
    high_coupling_tokens: { items: [], total: 0, truncated: false },
    broken_aliases: { items: [], total: 0, truncated: false },
    broken_css_var_refs: { items: [], total: 0, truncated: false },
    wcag_failures: { items: [], total: 0, truncated: false },
    upstream_fingerprints: {
      token_usage_index: "",
      token_graph_viz: "",
    },
    fingerprint_sha256: "",
    hint: "Token health is not available yet. Capture components and token inputs first, then run token health.",
  };
}

function buildEmptyComponentsHealthReport(args) {
  return {
    ok: false,
    bootstrapped: true,
    schema_version: 1,
    source: {
      registry_path: args.componentRegistryPath,
    },
    summary: {
      total_components: 0,
      ready: 0,
      needs_review: 0,
      draft: 0,
      missing: 0,
      with_visual_proof: 0,
      average_coverage_percent: 0,
      by_pipeline_stage: {},
    },
    filters: {
      needs_review: { items: [], total: 0, truncated: false },
      missing_visual_proof: { items: [], total: 0, truncated: false },
      blocked_in_pipeline: { items: [], total: 0, truncated: false },
    },
    components: [],
    fingerprint_sha256: "",
  };
}

async function readJsonBody(c) {
  try {
    const parsed = await c.req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function normalizeHealthHistoryRange(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "7d" || value === "90d") return value;
  return "30d";
}

function rangeDays(range) {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function normalizeHealthHistoryPayload(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const rawSnapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  const snapshots = [];

  for (const item of rawSnapshots) {
    if (!item || typeof item !== "object") continue;
    const capturedAt = String(item.captured_at || "").trim();
    if (!capturedAt) continue;

    const metrics = item.metrics && typeof item.metrics === "object" ? item.metrics : {};
    const fingerprints =
      item.fingerprints && typeof item.fingerprints === "object" ? item.fingerprints : {};
    const meta = item.meta && typeof item.meta === "object" ? item.meta : {};

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

function filterSnapshotsByRange(snapshots, range) {
  const days = rangeDays(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const epoch = new Date(snapshot.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoff;
  });
}

function isDevRuntime() {
  return process.env.NODE_ENV === "development";
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sanitizeSlug(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!COMPONENT_SLUG_RE.test(slug)) return null;
  return slug;
}

async function resolveComponentSpecTarget({ repoRoot: root, componentRegistryPath, slug }) {
  const registryRaw = await fs.readFile(componentRegistryPath, "utf8");
  const registry = JSON.parse(registryRaw);
  const component = (registry.components ?? []).find(
    (candidate) => String(candidate.slug ?? "").trim().toLowerCase() === slug,
  );
  if (!component) {
    return { ok: false, message: `Component '${slug}' not found.` };
  }

  const specRelPath = String(component?.paths?.spec ?? "").trim();
  if (!specRelPath) {
    return { ok: false, message: `Component '${slug}' does not define a spec path.` };
  }

  const specAbsPath = resolveRepoFilePath(root, specRelPath);
  if (!specAbsPath) {
    return { ok: false, message: `Spec path for '${slug}' is outside repository root.` };
  }

  return {
    ok: true,
    component,
    specRelPath,
    specAbsPath,
  };
}

function parseYamlSafely(raw) {
  try {
    const parsed = yaml.load(raw);
    return {
      parsed: parsed ?? null,
      parseError: null,
    };
  } catch (error) {
    return {
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildSpecValidationPayload(args) {
  const parsedCandidate = parseYamlSafely(args.raw);
  if (!parsedCandidate.parsed) {
    return {
      ok: true,
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
            severity: "error",
            code: "SPEC_YAML_PARSE_ERROR",
            path: "$",
            message: parsedCandidate.parseError || "Unable to parse YAML.",
            requiresConfirmation: false,
          },
        ],
      },
      diff: [],
    };
  }

  const validation = validateComponentSpec(parsedCandidate.parsed, {
    tokenRegistry: args.tokenRegistry,
    previousSpec: args.baselineParsed,
  });
  const diff = buildSpecDiff(args.baselineParsed, parsedCandidate.parsed);

  return {
    ok: true,
    slug: args.slug,
    path: args.path,
    rawHash: sha256Text(args.raw),
    parsed: parsedCandidate.parsed,
    validation,
    diff,
  };
}

async function runCommandCapture(args) {
  return await new Promise((resolve) => {
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

function normalizeImpactWcagPairs(raw) {
  const list =
    raw && typeof raw === "object" && Array.isArray(raw.pairs)
      ? raw.pairs
      : [];

  const pairs = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const foreground = String(item.foreground ?? "").trim();
    const background = String(item.background ?? "").trim();
    if (!foreground || !background) continue;
    const level = String(item.level ?? "AA").trim().toUpperCase() === "AAA" ? "AAA" : "AA";
    const textSize =
      String(item.textSize ?? "normal").trim().toLowerCase() === "large"
        ? "large"
        : "normal";
    pairs.push({ foreground, background, level, textSize });
  }
  return pairs;
}

async function computeNamingDebtReport(args) {
  const [tokenRegistryRaw, tokenUsageRaw, tokenGraphRaw, namingConfigRaw] = await Promise.all([
    fs.readFile(args.tokenRegistryPath, "utf8"),
    fs.readFile(args.tokenUsageIndexPath, "utf8").catch(() => "null"),
    fs.readFile(args.tokenGraphVizPath, "utf8").catch(() => "null"),
    fs.readFile(args.namingDebtConfigPath, "utf8").catch(() => "null"),
  ]);

  const tokenRegistry = JSON.parse(tokenRegistryRaw);
  const tokenUsageIndex = tokenUsageRaw ? JSON.parse(tokenUsageRaw) : null;
  const tokenGraph = tokenGraphRaw ? JSON.parse(tokenGraphRaw) : null;
  const config = namingConfigRaw ? JSON.parse(namingConfigRaw) : null;

  return analyzeNamingDebt({
    tokenRegistry,
    tokenUsageIndex,
    tokenGraph,
    config: config || undefined,
  });
}

async function runNodeJsonCommandOnce(args) {
  return await new Promise((resolve) => {
    const child = spawn(args.command, args.commandArgs, {
      cwd: args.cwd,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += String(chunk);
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        statusCode: 500,
        payload: {
          ok: false,
          command: args.commandLabel,
          message: error instanceof Error ? error.message : String(error),
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
      });
    });

    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1;
      if (exitCode !== 0) {
        resolve({
          ok: false,
          statusCode: 500,
          payload: {
            ok: false,
            command: args.commandLabel,
            code: exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          },
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve({
          ok: true,
          statusCode: 200,
          payload: parsed,
        });
      } catch (error) {
        resolve({
          ok: false,
          statusCode: 500,
          payload: {
            ok: false,
            command: args.commandLabel,
            message: "Command returned invalid JSON.",
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            parse_error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });
  });
}

function getSystemContext(systemHeader) {
  return designSystemRepository.resolveDashboardSystemContext(systemHeader);
}

function queueNpmScript({ repoRoot: root, script, systemId, commandLabel }) {
  const safeScript = String(script || "").trim();
  if (!safeScript) throw new Error("Missing script name.");

  const scriptArgs = ["run", safeScript, "--"];
  if (systemId) scriptArgs.push("--system", systemId);
  const label = commandLabel || `npm run ${safeScript}`;

  return enqueueQueueJob({
    label,
    systemId,
    execute: async ({ emitChunk, setProcess }) =>
      await runQueuedSpawnCommand({
        cwd: root,
        command: "npm",
        commandArgs: scriptArgs,
        emitChunk,
        registerProcess: setProcess,
        commandLabel: label,
      }),
  });
}

function queueNodeJsonCommand({
  repoRoot: root,
  commandLabel,
  scriptPath,
  scriptArgs,
  systemId,
  allowNonZeroJson,
}) {
  const finalArgs = [...scriptArgs];
  if (systemId) finalArgs.push("--system", systemId);
  const commandArgs = [scriptPath, ...finalArgs];

  return enqueueQueueJob({
    label: commandLabel,
    systemId,
    execute: async ({ emitChunk, setProcess }) =>
      await runQueuedSpawnCommand({
        cwd: root,
        command: "node",
        commandArgs,
        emitChunk,
        registerProcess: setProcess,
        commandLabel,
        parseJsonStdout: true,
        allowNonZeroJson: allowNonZeroJson === true,
      }),
  });
}

const app = new Hono();

function createApiRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function writeStructuredLog(level, payload) {
  const base = {
    level,
    ts: Date.now(),
    service: "ds-dashboard-api",
  };
  const line = JSON.stringify({ ...base, ...(payload && typeof payload === "object" ? payload : {}) });
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

function buildApiErrorPayload({
  code,
  userMessage,
  recoverable = false,
  context,
  requestId,
}) {
  const safeMessage = String(userMessage || "Request failed.");
  const safeCode = String(code || "internal.unknown_error");
  const safeRequestId = String(requestId || createApiRequestId());
  const payload = {
    ok: false,
    message: safeMessage,
    requestId: safeRequestId,
    error: {
      code: safeCode,
      userMessage: safeMessage,
      recoverable: recoverable === true,
    },
  };
  if (context && typeof context === "object" && !Array.isArray(context)) {
    payload.error.context = context;
  }
  return payload;
}

function failJson(c, statusCode, args) {
  const requestId = String(args?.requestId || createApiRequestId());
  const payload = buildApiErrorPayload({
    ...args,
    requestId,
  });
  if (args?.suppressLog !== true) {
    writeStructuredLog(statusCode >= 500 ? "error" : "warn", {
      event: "api.error",
      requestId,
      code: payload?.error?.code || "internal.unknown_error",
      statusCode,
      recoverable: payload?.error?.recoverable === true,
      path: c.req.path,
      method: c.req.method,
      context: payload?.error?.context || null,
    });
  }
  return c.json(payload, statusCode);
}

function buildHealthPayload() {
  return {
    status: "ok",
    service: "ds-dashboard-api",
    now: nowIso(),
    uptime: process.uptime(),
    queue: queueMetrics(),
  };
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    ...buildHealthPayload(),
  }),
);

app.get("/api/health", (c) => c.json(buildHealthPayload()));

app.get("/api/design-systems", () => {
  const config = designSystemRepository.getConfig();
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});

app.post("/api/design-systems", async (c) => {
  const body = await readJsonBody(c);
  const config = designSystemRepository.getConfig();
  const systemId = normalizeSystemId(body.id);
  const systemName = String(body.name || "").trim();
  if (!systemId || !systemName) {
    return failJson(c, 400, {
      code: "validation.missing_required_fields",
      userMessage: "Both `id` and `name` are required.",
      recoverable: true,
      context: { required: ["id", "name"] },
    });
  }

  const exists = Array.isArray(config.systems)
    ? config.systems.some((row) => String(row?.id || "").trim() === systemId)
    : false;
  if (exists) {
    return failJson(c, 409, {
      code: "design_system.already_exists",
      userMessage: `System '${systemId}' already exists.`,
      recoverable: true,
      context: { systemId },
    });
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

  designSystemRepository.saveConfig(nextConfig);
  return c.json(
    {
      ok: true,
      system: { id: nextSystem.id, name: nextSystem.name },
      config: summarizeDesignSystemsConfig(nextConfig),
    },
    200,
  );
});

app.put("/api/design-systems/:id", async (c) => {
  const routeSystemId = decodeURIComponent(String(c.req.param("id") || ""));
  const body = await readJsonBody(c);
  const config = designSystemRepository.getConfig();
  const nextSystems = Array.isArray(config.systems) ? [...config.systems] : [];
  const targetIndex = nextSystems.findIndex(
    (row) => String(row?.id || "").trim() === routeSystemId,
  );
  if (targetIndex < 0) {
    return failJson(c, 404, {
      code: "design_system.not_found",
      userMessage: `System '${routeSystemId}' not found.`,
      recoverable: true,
      context: { systemId: routeSystemId },
    });
  }

  const current = nextSystems[targetIndex] || {};
  const normalizedName = String(body.name ?? current.name ?? "").trim();
  if (!normalizedName) {
    return failJson(c, 400, {
      code: "validation.invalid_name",
      userMessage: "System name cannot be empty.",
      recoverable: true,
      context: { field: "name" },
    });
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
    collections: normalizeCollectionList(body.collections ?? current.collections ?? []),
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
  designSystemRepository.saveConfig(nextConfig);
  return c.json(
    {
      ok: true,
      system: { id: routeSystemId, name: updated.name },
      config: summarizeDesignSystemsConfig(nextConfig),
    },
    200,
  );
});

app.delete("/api/design-systems/:id", (c) => {
  const routeSystemId = decodeURIComponent(String(c.req.param("id") || ""));
  const config = designSystemRepository.getConfig();
  const currentSystems = Array.isArray(config.systems) ? config.systems : [];
  const targetSystem = currentSystems.find(
    (row) => String(row?.id || "").trim() === routeSystemId,
  );
  const nextSystems = currentSystems.filter(
    (row) => String(row?.id || "").trim() !== routeSystemId,
  );
  if (nextSystems.length === currentSystems.length) {
    return failJson(c, 404, {
      code: "design_system.not_found",
      userMessage: `System '${routeSystemId}' not found.`,
      recoverable: true,
      context: { systemId: routeSystemId },
    });
  }
  if (nextSystems.length === 0) {
    return failJson(c, 400, {
      code: "design_system.last_system_protected",
      userMessage: "Cannot delete the last design system.",
      recoverable: true,
      context: { systemId: routeSystemId },
    });
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
    ? resolveSafeSystemPathsForDeletion(targetSystem, repoRoot, nextSystems)
    : [];
  for (const targetPath of removedPaths) {
    if (!fsSync.existsSync(targetPath)) continue;
    fsSync.rmSync(targetPath, { recursive: true, force: true });
  }

  designSystemRepository.saveConfig(nextConfig);
  return c.json(
    {
      ok: true,
      removedPaths,
      config: summarizeDesignSystemsConfig(nextConfig),
    },
    200,
  );
});

app.get("/api/component-registry", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.componentRegistryPath, "utf8");
  return c.json(JSON.parse(raw));
});

app.get("/api/component-usage-index", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.componentRegistryPath, "utf8");
  const registry = JSON.parse(raw);
  const rows = Array.isArray(registry?.components) ? registry.components : [];
  return c.json(buildComponentUsageIndex(rows, sysCtx.repoRoot));
});

app.get("/api/token-registry", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8");
  return c.json(JSON.parse(raw));
});

app.get("/api/token-collection-trees", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return c.json(buildTokenCollectionTrees(entries));
});

app.get("/api/token-usage-index", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.tokenUsageIndexPath, "utf8");
  return c.json(JSON.parse(raw));
});

app.get("/api/token-graph", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const raw = await fs.readFile(sysCtx.tokenGraphVizPath, "utf8");
  return c.json(JSON.parse(raw));
});

app.get("/api/token-graph-query", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const token = String(c.req.query("token") ?? c.req.query("tokenPath") ?? "").trim();
  if (!token) {
    return failJson(c, 400, {
      code: "validation.token_required",
      userMessage: "token query param is required.",
      recoverable: true,
      context: { field: "token" },
    });
  }

  const direction = normalizeTokenGraphDirection(c.req.query("direction"));
  const depth = normalizeTokenGraphDepth(c.req.query("depth"));
  const raw = await fs.readFile(sysCtx.tokenGraphVizPath, "utf8");
  const graph = JSON.parse(raw);
  const payload = buildTokenGraphQueryPayload({ graph, token, direction, depth });
  if (!payload) {
    return failJson(c, 404, {
      code: "token_graph.token_not_found",
      userMessage: `Token '${token}' not found in token graph.`,
      recoverable: true,
      context: { token },
    });
  }
  return c.json(payload);
});

app.get("/api/token-health", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  try {
    const raw = await fs.readFile(sysCtx.tokenHealthPath, "utf8");
    return c.json(JSON.parse(raw));
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code || "")
        : "";
    if (code !== "ENOENT") throw error;

    return c.json(
      buildEmptyTokenHealthReport({
        tokenRegistryPath: sysCtx.tokenRegistryPath,
        tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
        tokenGraphVizPath: sysCtx.tokenGraphVizPath,
        wcagPairsPath: sysCtx.wcagPairsPath,
        reason: "Token health artifact not found. Run the pipeline or capture components first.",
      }),
    );
  }
});

app.get("/api/components-health", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  try {
    const raw = await fs.readFile(sysCtx.componentsHealthPath, "utf8");
    return c.json(JSON.parse(raw));
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code || "")
        : "";
    if (code !== "ENOENT") throw error;
    return c.json(
      buildEmptyComponentsHealthReport({
        componentRegistryPath: sysCtx.componentRegistryPath,
      }),
    );
  }
});

app.get("/api/health-history", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const range = normalizeHealthHistoryRange(c.req.query("range"));
  const raw = await fs.readFile(sysCtx.healthHistoryPath, "utf8").catch(() => "");
  const parsed = normalizeHealthHistoryPayload(raw ? JSON.parse(raw) : null);
  const snapshots = filterSnapshotsByRange(parsed.snapshots, range);
  return c.json({
    ...parsed,
    snapshots,
    summary: {
      snapshots_total: snapshots.length,
      latest_at: snapshots.length ? snapshots[snapshots.length - 1].captured_at : null,
    },
    range,
  });
});

app.get("/api/token-diff", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const beforeRefRaw = c.req.query("beforeRef") ?? "HEAD~1";
  const beforeRef = validateGitRef(beforeRefRaw);
  if (!beforeRef) {
    return failJson(c, 400, {
      code: "validation.invalid_git_ref",
      userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
      recoverable: true,
      context: { beforeRef: beforeRefRaw },
    });
  }

  const result = await runNodeJsonCommandOnce({
    cwd: sysCtx.repoRoot,
    command: "node",
    commandArgs: [sysCtx.tokenDiffScriptPath, "--before-ref", beforeRef, "--format", "json", "--system", sysCtx.systemId],
    commandLabel: `node tooling/scripts/ds-token-diff.mjs --before-ref ${beforeRef} --format json`,
  });
  return c.json(result.payload, result.statusCode);
});

app.get("/api/naming-debt", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const refresh = String(c.req.query("refresh") ?? "false").trim() === "true";
  if (!refresh) {
    const cached = await fs.readFile(sysCtx.namingDebtCachePath, "utf8").catch(() => "");
    if (cached.trim()) {
      return c.json(JSON.parse(cached));
    }
  }

  const report = await computeNamingDebtReport({
    tokenRegistryPath: sysCtx.tokenRegistryPath,
    tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
    tokenGraphVizPath: sysCtx.tokenGraphVizPath,
    namingDebtConfigPath: sysCtx.namingDebtConfigPath,
  });
  await fs.mkdir(path.dirname(sysCtx.namingDebtCachePath), { recursive: true });
  await fs.writeFile(sysCtx.namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return c.json(report);
});

app.get("/api/impact", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const tokenPath = String(c.req.query("tokenPath") ?? "").trim();
  if (!tokenPath) {
    return failJson(c, 400, {
      code: "validation.token_path_required",
      userMessage: "tokenPath query param is required.",
      recoverable: true,
      context: { field: "tokenPath" },
    });
  }

  const newValueRaw = c.req.query("newValue");
  const newValue = newValueRaw ? String(newValueRaw).trim() : null;
  const depthRaw = c.req.query("depth");
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
    fs.readFile(sysCtx.tokenRegistryPath, "utf8"),
    fs.readFile(sysCtx.tokenGraphVizPath, "utf8"),
    fs.readFile(sysCtx.tokenUsageIndexPath, "utf8"),
    fs.readFile(sysCtx.tokenHealthPath, "utf8").catch(() => "null"),
    fs.readFile(sysCtx.componentRegistryPath, "utf8").catch(() => "null"),
    fs.readFile(sysCtx.wcagPairsPath, "utf8").catch(() => '{"pairs": []}'),
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
    return c.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = message.includes("not found");
    return failJson(c, notFound ? 404 : 400, {
      code: notFound ? "impact.token_not_found" : "impact.invalid_request",
      userMessage: message,
      recoverable: true,
      context: { tokenPath },
    });
  }
});

app.get("/api/component-spec/:slug", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const slug = sanitizeSlug(decodeURIComponent(String(c.req.param("slug") || "")));
  if (!slug) {
    return failJson(c, 400, {
      code: "validation.invalid_component_slug",
      userMessage: "Invalid component slug.",
      recoverable: true,
      context: { slug: c.req.param("slug") },
    });
  }

  const target = await resolveComponentSpecTarget({
    repoRoot: sysCtx.repoRoot,
    componentRegistryPath: sysCtx.componentRegistryPath,
    slug,
  });
  if (!target.ok) {
    return failJson(c, 404, {
      code: "component_spec.not_found",
      userMessage: target.message,
      recoverable: true,
      context: { slug },
    });
  }

  let raw = "";
  let exists = true;
  try {
    raw = await fs.readFile(target.specAbsPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
    if (code === "ENOENT") {
      exists = false;
      raw = "";
    } else {
      throw error;
    }
  }

  const parsedPayload = parseYamlSafely(raw);
  return c.json({
    ok: true,
    slug,
    path: target.specRelPath,
    exists,
    raw,
    rawHash: exists ? sha256Text(raw) : null,
    parsed: parsedPayload.parsed,
    parseError: parsedPayload.parseError,
  });
});

app.post("/api/component-spec/:slug/validate", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  if (!isDevRuntime()) {
    return failJson(c, 403, {
      code: "component_spec.editing_disabled",
      userMessage: "Spec editing is only enabled in development mode.",
      recoverable: true,
    });
  }

  const slug = sanitizeSlug(decodeURIComponent(String(c.req.param("slug") || "")));
  if (!slug) {
    return failJson(c, 400, {
      code: "validation.invalid_component_slug",
      userMessage: "Invalid component slug.",
      recoverable: true,
      context: { slug: c.req.param("slug") },
    });
  }

  const target = await resolveComponentSpecTarget({
    repoRoot: sysCtx.repoRoot,
    componentRegistryPath: sysCtx.componentRegistryPath,
    slug,
  });
  if (!target.ok) {
    return failJson(c, 404, {
      code: "component_spec.not_found",
      userMessage: target.message,
      recoverable: true,
      context: { slug },
    });
  }

  const body = await readJsonBody(c);
  const raw = String(body.raw ?? "");
  if (!raw.trim()) {
    return c.json({
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
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_SPEC_BYTES) {
    return c.json({
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
  }

  let currentRaw = "";
  try {
    currentRaw = await fs.readFile(target.specAbsPath, "utf8");
  } catch {
    currentRaw = "";
  }
  const baselineParsed = parseYamlSafely(currentRaw).parsed;
  const tokenRegistryRaw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8").catch(() => "");
  const tokenRegistry = tokenRegistryRaw ? JSON.parse(tokenRegistryRaw) : null;

  const payload = buildSpecValidationPayload({
    slug,
    path: target.specRelPath,
    raw,
    baselineParsed,
    tokenRegistry,
  });
  return c.json(payload);
});

app.post("/api/component-spec/:slug/save", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  if (!isDevRuntime()) {
    return failJson(c, 403, {
      code: "component_spec.editing_disabled",
      userMessage: "Spec editing is only enabled in development mode.",
      recoverable: true,
    });
  }

  const slug = sanitizeSlug(decodeURIComponent(String(c.req.param("slug") || "")));
  if (!slug) {
    return failJson(c, 400, {
      code: "validation.invalid_component_slug",
      userMessage: "Invalid component slug.",
      recoverable: true,
      context: { slug: c.req.param("slug") },
    });
  }

  const target = await resolveComponentSpecTarget({
    repoRoot: sysCtx.repoRoot,
    componentRegistryPath: sysCtx.componentRegistryPath,
    slug,
  });
  if (!target.ok) {
    return failJson(c, 404, {
      code: "component_spec.not_found",
      userMessage: target.message,
      recoverable: true,
      context: { slug },
    });
  }

  const body = await readJsonBody(c);
  const raw = String(body.raw ?? "");
  const expectedHash =
    body.expectedHash === null || body.expectedHash === undefined
      ? null
      : String(body.expectedHash).trim() || null;
  const refreshRegistryAfterSave = body.refreshRegistry !== false;
  const confirmRiskyChanges = body.confirmRiskyChanges === true;

  if (!raw.trim()) {
    return c.json({
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
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_SPEC_BYTES) {
    return c.json({
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
  }

  let currentRaw = "";
  let currentExists = true;
  try {
    currentRaw = await fs.readFile(target.specAbsPath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
    if (code === "ENOENT") {
      currentRaw = "";
      currentExists = false;
    } else {
      throw error;
    }
  }

  const currentHash = currentExists ? sha256Text(currentRaw) : null;
  if (expectedHash && expectedHash !== currentHash) {
    return c.json({
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
            message: "Spec file changed on disk since you opened the editor. Reload to merge latest content.",
          },
        ],
      },
      diff: [],
      message: "Spec file changed on disk; reload before saving.",
    });
  }

  const baselineParsed = parseYamlSafely(currentRaw).parsed;
  const tokenRegistryRaw = await fs.readFile(sysCtx.tokenRegistryPath, "utf8").catch(() => "");
  const tokenRegistry = tokenRegistryRaw ? JSON.parse(tokenRegistryRaw) : null;
  const validationPayload = buildSpecValidationPayload({
    slug,
    path: target.specRelPath,
    raw,
    baselineParsed,
    tokenRegistry,
  });

  if (!validationPayload.validation.valid) {
    return c.json({
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
  }

  const requiresConfirmation = validationPayload.validation.issues.some(
    (issue) => issue.requiresConfirmation === true,
  );
  if (requiresConfirmation && !confirmRiskyChanges) {
    return c.json({
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
  }

  await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
  await fs.mkdir(sysCtx.specBackupsDirPath, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupTimestampPath = path.join(sysCtx.specBackupsDirPath, `${slug}.${timestamp}.yml`);
  const backupLatestPath = path.join(sysCtx.specBackupsDirPath, `${slug}.last.yml`);
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
      cwd: sysCtx.repoRoot,
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    });
    refreshed = refresh.ok;
    refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
    if (!refresh.ok) {
      return c.json({
        ok: false,
        slug,
        path: target.specRelPath,
        rawHash: sha256Text(raw),
        backupPath: path.relative(sysCtx.repoRoot, backupLatestPath),
        parsed: validationPayload.parsed,
        validation: validationPayload.validation,
        diff: validationPayload.diff,
        refreshed,
        refreshOutput,
        message: "Spec saved, but registry refresh failed.",
      });
    }
  }

  return c.json({
    ok: true,
    slug,
    path: target.specRelPath,
    rawHash: sha256Text(raw),
    backupPath: path.relative(sysCtx.repoRoot, backupLatestPath),
    parsed: validationPayload.parsed,
    validation: validationPayload.validation,
    diff: validationPayload.diff,
    refreshed,
    refreshOutput,
    message: "Spec saved successfully.",
  });
});

app.post("/api/component-spec/:slug/restore-backup", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  if (!isDevRuntime()) {
    return failJson(c, 403, {
      code: "component_spec.editing_disabled",
      userMessage: "Spec editing is only enabled in development mode.",
      recoverable: true,
    });
  }

  const slug = sanitizeSlug(decodeURIComponent(String(c.req.param("slug") || "")));
  if (!slug) {
    return failJson(c, 400, {
      code: "validation.invalid_component_slug",
      userMessage: "Invalid component slug.",
      recoverable: true,
      context: { slug: c.req.param("slug") },
    });
  }

  const target = await resolveComponentSpecTarget({
    repoRoot: sysCtx.repoRoot,
    componentRegistryPath: sysCtx.componentRegistryPath,
    slug,
  });
  if (!target.ok) {
    return failJson(c, 404, {
      code: "component_spec.not_found",
      userMessage: target.message,
      recoverable: true,
      context: { slug },
    });
  }

  const body = await readJsonBody(c);
  const refreshRegistryAfterRestore = body.refreshRegistry !== false;
  const backupLatestPath = path.join(sysCtx.specBackupsDirPath, `${slug}.last.yml`);
  const backupExists = await fs
    .stat(backupLatestPath)
    .then((stat) => stat.isFile())
    .catch(() => false);

  if (!backupExists) {
    return c.json({
      ok: false,
      slug,
      path: target.specRelPath,
      restoredFrom: null,
      rawHash: null,
      message: "No backup file found for this component.",
    });
  }

  const backupRaw = await fs.readFile(backupLatestPath, "utf8");
  if (!backupRaw.trim()) {
    return c.json({
      ok: false,
      slug,
      path: target.specRelPath,
      restoredFrom: path.relative(sysCtx.repoRoot, backupLatestPath),
      rawHash: null,
      message: "Backup exists but is empty; restore skipped.",
    });
  }

  await fs.mkdir(path.dirname(target.specAbsPath), { recursive: true });
  const tempPath = `${target.specAbsPath}.tmp-restore-${Date.now()}`;
  await fs.writeFile(tempPath, backupRaw, "utf8");
  await fs.rename(tempPath, target.specAbsPath);

  let refreshed = false;
  let refreshOutput = "";
  if (refreshRegistryAfterRestore) {
    const refresh = await runCommandCapture({
      cwd: sysCtx.repoRoot,
      command: "npm",
      commandArgs: ["run", "ds:registry:refresh"],
    });
    refreshed = refresh.ok;
    refreshOutput = [refresh.stdout, refresh.stderr].filter(Boolean).join("\n").trim();
  }

  return c.json({
    ok: true,
    slug,
    path: target.specRelPath,
    restoredFrom: path.relative(sysCtx.repoRoot, backupLatestPath),
    rawHash: sha256Text(backupRaw),
    refreshed,
    refreshOutput,
    message: "Spec restored from latest backup.",
  });
});

app.get("/api/file", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const requested = c.req.query("path") ?? c.req.query("file") ?? "";
  const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
  if (!absPath) {
    return failJson(c, 400, {
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
      recoverable: true,
      context: { requested },
    });
  }

  try {
    const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
    return c.json({
      ok: true,
      file: requested,
      truncated: payload.truncated,
      content: payload.content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failJson(c, 404, {
      code: "file.not_found",
      userMessage: message,
      recoverable: true,
      context: { requested },
    });
  }
});

app.get("/api/file-snippet", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const requested = c.req.query("file") ?? "";
  const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
  if (!absPath) {
    return failJson(c, 400, {
      code: "file.invalid_path",
      userMessage: "Invalid file path.",
      recoverable: true,
      context: { requested },
    });
  }

  const rawLine = c.req.query("line");
  const rawBefore = c.req.query("before");
  const rawAfter = c.req.query("after");
  const before = rawBefore ? Number.parseInt(rawBefore, 10) : 2;
  const after = rawAfter ? Number.parseInt(rawAfter, 10) : 2;
  const query = c.req.query("q") ?? "";

  let line = rawLine ? Number.parseInt(rawLine, 10) : Number.NaN;
  if (rawLine && !Number.isFinite(line)) {
    return failJson(c, 400, {
      code: "validation.invalid_line_parameter",
      userMessage: "Invalid line parameter.",
      recoverable: true,
      context: { line: rawLine },
    });
  }

  let content = "";
  try {
    const payload = await readTextFileLimited(absPath, MAX_FILE_BYTES);
    content = payload.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failJson(c, 404, {
      code: "file.not_found",
      userMessage: message,
      recoverable: true,
      context: { requested },
    });
  }

  let matchedBy = "line";
  if (!rawLine) {
    const detected = findLineForQuery(content, query);
    if (!detected) {
      return failJson(c, 404, {
        code: "file.query_not_found",
        userMessage: "Query not found in file.",
        recoverable: true,
        context: { requested, query },
      });
    }
    line = detected;
    matchedBy = "query";
  }

  const snippet = buildSnippet(content, line, before, after);
  return c.json({
    ok: true,
    file: requested,
    line: snippet.targetLine,
    startLine: snippet.startLine,
    endLine: snippet.endLine,
    matchedBy,
    snippet: snippet.snippet,
  });
});

app.get("/api/asset", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const requested = c.req.query("path") ?? "";
  const absPath = resolveRepoFilePath(sysCtx.repoRoot, requested);
  if (!absPath) {
    return failJson(c, 400, {
      code: "asset.invalid_path",
      userMessage: "Invalid asset path.",
      recoverable: true,
      context: { requested },
    });
  }

  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      return failJson(c, 404, {
        code: "asset.not_found",
        userMessage: "Asset not found.",
        recoverable: true,
        context: { requested },
      });
    }
    const buffer = await fs.readFile(absPath);
    return c.body(buffer, 200, {
      "Content-Type": guessContentType(absPath),
      "Cache-Control": "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failJson(c, 404, {
      code: "asset.not_found",
      userMessage: message,
      recoverable: true,
      context: { requested },
    });
  }
});

app.get("/api/jobs/:jobId", (c) => {
  const jobId = decodeURIComponent(String(c.req.param("jobId") || ""));
  const job = queueJobs.get(jobId);
  if (!job) {
    return failJson(c, 404, {
      code: "queue.job_not_found",
      userMessage: `Job '${jobId}' not found.`,
      recoverable: true,
      context: { jobId },
    });
  }

  const sinceRaw = Number.parseInt(String(c.req.query("since") || ""), 10);
  const limitRaw = Number.parseInt(String(c.req.query("limit") || ""), 10);
  const since = Number.isFinite(sinceRaw) ? Math.max(0, sinceRaw) : 0;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1_000)) : 300;
  const events = listQueueJobEvents(job, { since, limit });
  const nextCursor =
    job.events.length > 0 ? job.events[job.events.length - 1].seq : Math.max(0, job.nextSeq - 1);

  return c.json({
    ok: true,
    job: queueJobSnapshot(job),
    done: isQueueJobFinalStatus(job.status),
    events,
    nextCursor,
  });
});

app.delete("/api/jobs/:jobId", (c) => {
  const jobId = decodeURIComponent(String(c.req.param("jobId") || ""));
  const job = queueJobs.get(jobId);
  if (!job) {
    return failJson(c, 404, {
      code: "queue.job_not_found",
      userMessage: `Job '${jobId}' not found.`,
      recoverable: true,
      context: { jobId },
    });
  }

  const cancelled = cancelQueueJob(jobId);
  if (!cancelled.ok) {
    return failJson(c, 409, {
      code: "queue.job_not_cancelable",
      userMessage: String(cancelled.message || "Job cannot be cancelled."),
      recoverable: true,
      context: { jobId, status: job.status },
    });
  }
  return c.json({ ok: true, job: queueJobSnapshot(job) });
});

app.get("/api/jobs/:jobId/stream", (c) => {
  const jobId = decodeURIComponent(String(c.req.param("jobId") || ""));
  const sinceRaw = Number.parseInt(String(c.req.query("since") || ""), 10);
  const since = Number.isFinite(sinceRaw) ? Math.max(0, sinceRaw) : 0;
  const existing = queueJobs.get(jobId);
  if (!existing) {
    return failJson(c, 404, {
      code: "queue.job_not_found",
      userMessage: `Job '${jobId}' not found.`,
      recoverable: true,
      context: { jobId },
    });
  }

  return streamSSE(c, async (stream) => {
    let cursor = since;
    const deadline = Date.now() + 25 * 60 * 1000;

    while (Date.now() < deadline) {
      const job = queueJobs.get(jobId);
      if (!job) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            ...buildApiErrorPayload({
              code: "queue.job_not_found",
              userMessage: `Job '${jobId}' not found.`,
              recoverable: true,
              context: { jobId },
            }),
          }),
        });
        return;
      }

      const events = listQueueJobEvents(job, {
        since: cursor,
        limit: MAX_RETAINED_EVENTS,
      });
      for (const event of events) {
        cursor = Math.max(cursor, Number(event.seq) || cursor);
        await stream.writeSSE({ data: JSON.stringify(event) });
      }

      if (isQueueJobFinalStatus(job.status)) return;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }

    await stream.writeSSE({
      data: JSON.stringify({
        type: "error",
        ...buildApiErrorPayload({
          code: "queue.stream_timeout",
          userMessage: "Stream timeout waiting for job completion.",
          recoverable: true,
          context: { jobId },
        }),
      }),
    });
  });
});

app.post("/api/run/:script", async (c) => {
  const scriptName = String(c.req.param("script") || "").trim();
  if (!scriptName) {
    return failJson(c, 400, {
      code: "validation.missing_script_name",
      userMessage: "Missing script name in URL.",
      recoverable: true,
    });
  }

  const body = await readJsonBody(c);
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const args = ["run", scriptName, "--", "--system", sysCtx.systemId];

  if (scriptName === "ds:pipeline") {
    if (body.all) args.push("--all");
    if (body.component) {
      args.push("--component", String(body.component));
    }
    if (body.fromStep) {
      args.push("--from-step", String(body.fromStep));
    }
    if (body.dryRun) args.push("--status-only");
  }

  const commandLabel = `npm ${args.join(" ")}`;
  const job = enqueueQueueJob({
    label: commandLabel,
    systemId: sysCtx.systemId,
    execute: async ({ emitChunk, setProcess }) =>
      await runQueuedSpawnCommand({
        cwd: sysCtx.repoRoot,
        command: "npm",
        commandArgs: args,
        emitChunk,
        registerProcess: setProcess,
        commandLabel,
      }),
  });

  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-registry", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:registry:refresh",
    systemId: sysCtx.systemId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-usage-index", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-usage-index",
    systemId: sysCtx.systemId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-graph", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-graph",
    systemId: sysCtx.systemId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-health", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-health",
    systemId: sysCtx.systemId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-components-health", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:registry:report",
    systemId: sysCtx.systemId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-naming-debt", (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = enqueueQueueJob({
    label: "refresh naming debt",
    systemId: sysCtx.systemId,
    execute: async ({ emitChunk }) => {
      emitChunk("system", "Computing naming debt report...");
      const report = await computeNamingDebtReport({
        tokenRegistryPath: sysCtx.tokenRegistryPath,
        tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
        tokenGraphVizPath: sysCtx.tokenGraphVizPath,
        namingDebtConfigPath: sysCtx.namingDebtConfigPath,
      });
      await fs.mkdir(path.dirname(sysCtx.namingDebtCachePath), { recursive: true });
      await fs.writeFile(sysCtx.namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      return {
        ok: true,
        code: 0,
        summary: "Naming debt refreshed.",
        payload: {
          ok: true,
          generatedAt: report.generatedAt,
          totalViolations: report.summary.totalViolations,
          overallScore: report.summary.overallScore,
        },
      };
    },
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/capture-health-snapshot", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);

  const beforeRefRaw = String(body.beforeRef ?? "HEAD~1").trim();
  const beforeRef = validateGitRef(beforeRefRaw);
  if (!beforeRef) {
    return failJson(c, 400, {
      code: "validation.invalid_git_ref",
      userMessage: "Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -",
      recoverable: true,
      context: { beforeRef: beforeRefRaw },
    });
  }

  const retentionDaysRaw = Number(body.retentionDays);
  const retentionDays =
    Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0
      ? String(Math.floor(retentionDaysRaw))
      : "120";
  const skipDiff = toBooleanString(body.skipDiff, false);

  const job = queueNodeJsonCommand({
    repoRoot: sysCtx.repoRoot,
    commandLabel:
      `node tooling/scripts/ds-health-snapshot.mjs --before-ref ${beforeRef} ` +
      `--retention-days ${retentionDays} --skip-diff ${skipDiff}`,
    scriptPath: sysCtx.healthSnapshotScriptPath,
    systemId: sysCtx.systemId,
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
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/sync-figma-tokens", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);
  const figmaUrl = String(body.url ?? body.figmaUrl ?? "").trim();
  const figmaToken = String(body.figmaToken ?? "").trim();
  const force = toBooleanString(body.force, false);
  const merge = toBooleanString(body.merge, false);
  const compile = toBooleanString(body.compile, true);
  const dryRun = toBooleanString(body.dryRun, true);

  const commandArgs = [
    "--force",
    force,
    "--merge",
    merge,
    "--compile",
    compile,
    "--dry-run",
    dryRun,
  ];
  if (figmaUrl) commandArgs.push("--url", figmaUrl);
  if (figmaToken) commandArgs.push("--figma-token", figmaToken);

  const commandDisplayArgs = [...commandArgs];
  const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
  if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
    commandDisplayArgs[tokenIdx + 1] = "***redacted***";
  }

  const job = queueNodeJsonCommand({
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-tokens-from-figma.mjs ${commandDisplayArgs.join(" ")}`,
    scriptPath: sysCtx.tokensFromFigmaScriptPath,
    systemId: sysCtx.systemId,
    scriptArgs: commandArgs,
    allowNonZeroJson: true,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/capture-figma-screenshot", async (c) => {
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);
  const figmaUrl = String(body.figmaUrl ?? body.url ?? "").trim();
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: "validation.figma_url_required",
      userMessage: "figmaUrl is required in request body.",
      recoverable: true,
      context: { field: "figmaUrl" },
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(figmaUrl);
  } catch {
    return failJson(c, 400, {
      code: "validation.invalid_figma_url",
      userMessage: "Invalid figmaUrl.",
      recoverable: true,
      context: { figmaUrl },
    });
  }
  const host = String(parsedUrl.hostname || "").toLowerCase();
  if (host !== "figma.com" && !host.endsWith(".figma.com")) {
    return failJson(c, 400, {
      code: "validation.invalid_figma_host",
      userMessage: `URL host is not figma.com: ${host}`,
      recoverable: true,
      context: { host, figmaUrl },
    });
  }

  const componentSlug = String(body.componentSlug ?? "").trim().toLowerCase();
  const figmaToken = String(body.figmaToken ?? "").trim();
  const includeVariants = toBooleanString(body.includeVariants, true);
  const requireExistingDoc = toBooleanString(body.requireExistingDoc, true);
  const continueOnError = toBooleanString(body.continueOnError, true);
  const refreshIndices = toBooleanString(body.refreshIndices, true);
  const dryRun = toBooleanString(body.dryRun, false);
  const injectDocSpecs = toBooleanString(body.injectDocSpecs, false);
  const variantLimit = toNumberString(body.variantLimit, 6, 20);
  const scale = toNumberString(body.scale, 2, 4);
  const format = String(body.format ?? "png").trim().toLowerCase() || "png";
  const mainCaptureMode = String(body.mainCaptureMode ?? "rest").trim().toLowerCase() || "rest";
  const componentKind =
    String(body.componentKind ?? "component_set").trim().toLowerCase() || "component_set";

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
    "--inject-doc-specs",
    injectDocSpecs,
    "--scale",
    scale,
    "--format",
    format,
    "--main-capture-mode",
    mainCaptureMode,
    "--component-kind",
    componentKind,
  ];
  if (componentSlug) commandArgs.push("--component-slug", componentSlug);
  if (figmaToken) commandArgs.push("--figma-token", figmaToken);

  const commandDisplayArgs = [...commandArgs];
  const tokenIdx = commandDisplayArgs.indexOf("--figma-token");
  if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
    commandDisplayArgs[tokenIdx + 1] = "***redacted***";
  }

  const job = queueNodeJsonCommand({
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${commandDisplayArgs.join(" ")}`,
    scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
    systemId: sysCtx.systemId,
    scriptArgs: commandArgs,
    allowNonZeroJson: true,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.onError((error, c) => {
  const requestId = createApiRequestId();
  const message = error instanceof Error ? error.message : String(error);
  writeStructuredLog("error", {
    event: "api.unhandled_error",
    requestId,
    code: "internal.unexpected_error",
    path: c.req.path,
    method: c.req.method,
    error: {
      name: error instanceof Error ? error.name : "UnknownError",
      message,
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  return failJson(c, 500, {
    code: "internal.unexpected_error",
    userMessage: message || "Unexpected server error.",
    recoverable: true,
    requestId,
    context: {
      path: c.req.path,
      method: c.req.method,
    },
    suppressLog: true,
  });
});

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.log(`[ds-dashboard-api] listening on http://localhost:${info.port}`);
  },
);

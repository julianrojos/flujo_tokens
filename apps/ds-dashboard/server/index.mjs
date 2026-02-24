import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  createDesignSystemRepository,
  ensureRelativeDir,
  normalizeCollectionList,
  normalizeFigmaApiTokenRef,
  normalizeSystemId,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from "./system-repository.ts";
import { registerSystemRoutes } from "./routes/system-routes.mjs";
import { registerOperationsRoutes } from "./routes/operations-routes.mjs";
import { registerRegistryRoutes } from "./routes/registry-routes.mjs";
import { registerTokenGraphRoutes } from "./routes/token-graph-routes.mjs";
import { registerHealthRoutes } from "./routes/health-routes.mjs";
import { registerAnalysisRoutes } from "./routes/analysis-routes.mjs";
import { registerComponentSpecRoutes } from "./routes/component-spec-routes.mjs";
import { registerFileRoutes } from "./routes/file-routes.mjs";
import { registerJobRoutes } from "./routes/job-routes.mjs";
import { registerCommandRoutes } from "./routes/command-routes.mjs";
import {
  computeNamingDebtReport,
  validateGitRef,
} from "./lib/analysis-artifacts-service.mjs";
import { runSpawnWithCapture } from "./lib/spawn-runner.mjs";
import {
  isQueueJobFinalStatus,
  listQueueJobEvents,
  queueJobAcceptedPayload,
  queueJobSnapshot,
  toQueueSummaryFromPayload,
  toQueueTerminalEvent,
} from "./lib/queue-utils.mjs";
import { createOperationHistoryService } from "./lib/operation-history-service.mjs";

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
const JOB_QUEUE_CONCURRENCY = 1;
const JOB_TIMEOUT_MS =
  Number.parseInt(String(process.env.DS_DASHBOARD_JOB_TIMEOUT_MS || "600000"), 10) || 600000;
const JOB_RETENTION_MS = 30 * 60 * 1000;
const MAX_RETAINED_EVENTS = 2_000;
const MAX_RETAINED_JOBS = 200;
const OPS_LOG_MAX_FILE_BYTES =
  Number.parseInt(String(process.env.DS_DASHBOARD_OPS_LOG_MAX_FILE_BYTES || "1048576"), 10) || 1_048_576;
const OPS_LOG_RETENTION_DAYS =
  Number.parseInt(String(process.env.DS_DASHBOARD_OPS_LOG_RETENTION_DAYS || "30"), 10) || 30;
const OPS_HISTORY_DEFAULT_LIMIT = 100;
const OPS_HISTORY_MAX_LIMIT = 500;
const OPS_REGRESSION_DEFAULT_LIMIT = 300;
const OPS_REGRESSION_MAX_LIMIT = OPS_HISTORY_MAX_LIMIT;
const OPS_REGRESSION_DEFAULT_MIN_SAMPLES = 4;
const OPS_LOG_FILE_RE = /^operations-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.ndjson$/;
const REPLAYABLE_NPM_SCRIPTS = new Set([
  "ds:registry:refresh",
  "ds:token-usage-index",
  "ds:token-graph",
  "ds:token-health",
  "ds:registry:report",
]);
const SUPPORTED_REPLAY_OPERATIONS = new Set([
  "refresh:naming-debt",
  "script:ds-health-snapshot.mjs",
  ...Array.from(REPLAYABLE_NPM_SCRIPTS).map((script) => `script:${script}`),
]);

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

function createOperationEventId() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function operationResultSummary(result) {
  if (!result || typeof result !== "object") return "";
  const summary = String(result.summary ?? "").trim();
  if (summary) return summary;
  const payload = result.payload && typeof result.payload === "object" ? result.payload : null;
  const payloadMessage = String(payload?.message ?? payload?.error ?? "").trim();
  if (payloadMessage) return payloadMessage;
  return "";
}

function hashUnknown(value) {
  try {
    return sha256Text(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function operationDurationMs(startedAt, finishedAt) {
  const startTs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endTs = finishedAt ? new Date(finishedAt).getTime() : NaN;
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return null;
  return endTs - startTs;
}

const operationHistoryService = createOperationHistoryService({
  repoRoot,
  designSystemRepository,
  normalizeSystemId,
  writeStructuredLog,
  nowIso,
  createOperationEventId,
  opsLogMaxFileBytes: OPS_LOG_MAX_FILE_BYTES,
  opsLogRetentionDays: OPS_LOG_RETENTION_DAYS,
  opsHistoryMaxLimit: OPS_HISTORY_MAX_LIMIT,
  opsLogFileRegex: OPS_LOG_FILE_RE,
});

const {
  appendOperationEventSafe,
  toFiniteTimestamp,
  readOperationHistory,
  findOperationEventById,
  buildOperationRegressionsReport,
} = operationHistoryService;

function createQueueJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function enqueueQueueJob({ label, systemId, operationName, requestId, sourceEventId, inputHash, execute }) {
  const job = {
    id: createQueueJobId(),
    label,
    systemId,
    operationName: String(operationName || label || "unknown.operation"),
    requestId: requestId ? String(requestId) : null,
    sourceEventId: sourceEventId ? String(sourceEventId) : null,
    inputHash: inputHash ? String(inputHash) : hashUnknown({ label, systemId }),
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
  appendOperationEventSafe({
    timestamp: job.createdAt,
    eventType: "job.queued",
    operation: job.operationName,
    systemId: job.systemId,
    status: job.status,
    durationMs: null,
    requestId: job.requestId,
    jobId: job.id,
    sourceEventId: job.sourceEventId,
    inputHash: job.inputHash,
    outputHash: null,
    result: {
      ok: false,
      code: null,
      summary: "Queued.",
    },
  });
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
  appendOperationEventSafe({
    timestamp: job.startedAt,
    eventType: "job.running",
    operation: job.operationName,
    systemId: job.systemId,
    status: job.status,
    durationMs: null,
    requestId: job.requestId,
    jobId: job.id,
    sourceEventId: job.sourceEventId,
    inputHash: job.inputHash,
    outputHash: null,
    result: {
      ok: false,
      code: null,
      summary: "Running.",
    },
  });
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
      appendOperationEventSafe({
        timestamp: job.finishedAt,
        eventType: "job.finished",
        operation: job.operationName,
        systemId: job.systemId,
        status: "error",
        durationMs: operationDurationMs(job.startedAt, job.finishedAt),
        requestId: job.requestId,
        jobId: job.id,
        sourceEventId: job.sourceEventId,
        inputHash: job.inputHash,
        outputHash: hashUnknown(job.result?.payload),
        result: {
          ok: false,
          code: job.result.code,
          summary: timeoutMessage,
        },
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
      appendOperationEventSafe({
        timestamp: job.finishedAt,
        eventType: "job.finished",
        operation: job.operationName,
        systemId: job.systemId,
        status: "cancelled",
        durationMs: operationDurationMs(job.startedAt, job.finishedAt),
        requestId: job.requestId,
        jobId: job.id,
        sourceEventId: job.sourceEventId,
        inputHash: job.inputHash,
        outputHash: hashUnknown(result?.payload),
        result: {
          ok: false,
          code: typeof result.code === "number" ? result.code : 1,
          summary,
        },
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
    appendOperationEventSafe({
      timestamp: job.finishedAt,
      eventType: "job.finished",
      operation: job.operationName,
      systemId: job.systemId,
      status: job.status,
      durationMs: operationDurationMs(job.startedAt, job.finishedAt),
      requestId: job.requestId,
      jobId: job.id,
      sourceEventId: job.sourceEventId,
      inputHash: job.inputHash,
      outputHash: hashUnknown(result?.payload),
      result: {
        ok: result?.ok === true,
        code: typeof result.code === "number" ? result.code : result.ok ? 0 : 1,
        summary: operationResultSummary(result),
      },
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
    appendOperationEventSafe({
      timestamp: job.finishedAt,
      eventType: "job.finished",
      operation: job.operationName,
      systemId: job.systemId,
      status: "error",
      durationMs: operationDurationMs(job.startedAt, job.finishedAt),
      requestId: job.requestId,
      jobId: job.id,
      sourceEventId: job.sourceEventId,
      inputHash: job.inputHash,
      outputHash: null,
      result: {
        ok: false,
        code: didTimeout ? 124 : 1,
        summary: message || "Unknown queue error.",
      },
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
    appendOperationEventSafe({
      timestamp: job.finishedAt,
      eventType: "job.finished",
      operation: job.operationName,
      systemId: job.systemId,
      status: "cancelled",
      durationMs: operationDurationMs(job.startedAt, job.finishedAt),
      requestId: job.requestId,
      jobId: job.id,
      sourceEventId: job.sourceEventId,
      inputHash: job.inputHash,
      outputHash: null,
      result: {
        ok: false,
        code: 1,
        summary: "Cancelled before execution.",
      },
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

async function runQueuedSpawnCommand(args) {
  const result = await runSpawnWithCapture({
    cwd: args.cwd,
    command: args.command,
    commandArgs: args.commandArgs,
    parseJsonStdout: args.parseJsonStdout === true,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    onSpawn: args.registerProcess,
    onStdoutChunk: (text) => args.emitChunk("stdout", text),
    onStderrChunk: (text) => args.emitChunk("stderr", text),
  });

  if (result.spawnError) {
    return {
      ok: false,
      code: 1,
      summary: result.spawnError || `Unable to start command: ${args.commandLabel}`,
      payload: {
        ok: false,
        command: args.commandLabel,
        message: result.spawnError,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  const exitCode = result.exitCode;
  if (args.parseJsonStdout) {
    const rawStdout = result.stdout;
    if (result.jsonParseError) {
      return {
        ok: false,
        code: exitCode,
        summary: "Command returned invalid JSON.",
        payload: {
          ok: false,
          command: args.commandLabel,
          message: "Command returned invalid JSON.",
          stdout: rawStdout,
          stderr: result.stderr,
          parse_error: result.jsonParseError,
          code: exitCode,
        },
      };
    }

    const parsed = result.parsedJson;
    if (exitCode !== 0 && args.allowNonZeroJson) {
      const payload =
        parsed && typeof parsed === "object"
          ? {
              ...parsed,
              ok: false,
              exit_code: exitCode,
              stderr: result.stderr || undefined,
            }
          : {
              ok: false,
              exit_code: exitCode,
              stderr: result.stderr || undefined,
            };
      return {
        ok: false,
        code: exitCode,
        summary: toQueueSummaryFromPayload(payload, exitCode),
        payload,
      };
    }

    if (exitCode !== 0) {
      return {
        ok: false,
        code: exitCode,
        summary: `Failed with code ${exitCode}`,
        payload: {
          ok: false,
          command: args.commandLabel,
          code: exitCode,
          stdout: rawStdout,
          stderr: result.stderr,
        },
      };
    }

    const payload = parsed && typeof parsed === "object" ? parsed : {};
    const ok = payload.ok !== false;
    return {
      ok,
      code: ok ? 0 : 1,
      summary: ok
        ? String(payload.message ?? args.successSummary ?? "Completed successfully.")
        : toQueueSummaryFromPayload(payload, 1),
      payload,
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      code: exitCode,
      summary: `Failed with code ${exitCode}`,
      payload: {
        ok: false,
        command: args.commandLabel,
        code: exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  return {
    ok: true,
    code: 0,
    summary: args.successSummary || "Completed successfully.",
    payload: {
      ok: true,
      command: args.commandLabel,
      output: result.stdout,
    },
  };
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

async function readJsonBody(c) {
  try {
    const parsed = await c.req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

async function loadJsonArtifactOrError(c, args) {
  let raw = "";
  try {
    raw = await fs.readFile(args.filePath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code || "")
        : "";
    if (code === "ENOENT" && args.allowMissing) {
      return { ok: true, value: args.missingValue };
    }
    if (code === "ENOENT") {
      return {
        ok: false,
        response: failJson(c, 404, {
          code: "file.not_found",
          userMessage: `${args.artifactName} artifact not found.`,
          recoverable: true,
          context: { artifact: args.artifactName, filePath: args.filePath },
        }),
      };
    }
    return {
      ok: false,
      response: failJson(c, 500, {
        code: "internal.unexpected_error",
        userMessage: `Failed to read ${args.artifactName} artifact.`,
        recoverable: true,
        context: {
          artifact: args.artifactName,
          filePath: args.filePath,
          reason: error instanceof Error ? error.message : String(error),
        },
      }),
    };
  }

  if (!raw.trim()) {
    return {
      ok: false,
      response: failJson(c, 500, {
        code: "internal.unexpected_error",
        userMessage: `${args.artifactName} artifact is empty.`,
        recoverable: true,
        context: { artifact: args.artifactName, filePath: args.filePath },
      }),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      response: failJson(c, 500, {
        code: "internal.unexpected_error",
        userMessage: `${args.artifactName} artifact is not valid JSON.`,
        recoverable: true,
        context: {
          artifact: args.artifactName,
          filePath: args.filePath,
          reason: error instanceof Error ? error.message : String(error),
        },
      }),
    };
  }
}

function isDevRuntime() {
  return process.env.NODE_ENV === "development";
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function runCommandCapture(args) {
  const result = await runSpawnWithCapture({
    cwd: args.cwd,
    command: args.command,
    commandArgs: args.commandArgs,
  });
  return {
    ok: !result.spawnError && result.exitCode === 0,
    code: result.exitCode,
    stdout: result.stdout,
    stderr: [result.stderr, result.spawnError].filter(Boolean).join("\n").trim(),
  };
}

function getSystemContext(systemHeader) {
  return designSystemRepository.resolveDashboardSystemContext(systemHeader);
}

function queueNpmScript({ repoRoot: root, script, systemId, commandLabel, requestId, sourceEventId }) {
  const safeScript = String(script || "").trim();
  if (!safeScript) throw new Error("Missing script name.");

  const scriptArgs = ["run", safeScript, "--"];
  if (systemId) scriptArgs.push("--system", systemId);
  const label = commandLabel || `npm run ${safeScript}`;

  return enqueueQueueJob({
    label,
    systemId,
    requestId,
    sourceEventId,
    operationName: `script:${safeScript}`,
    inputHash: sha256Text(
      JSON.stringify({
        command: "npm",
        script: safeScript,
        args: scriptArgs,
        cwd: root,
        systemId: systemId || null,
      }),
    ),
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
  requestId,
  sourceEventId,
}) {
  const finalArgs = [...scriptArgs];
  if (systemId) finalArgs.push("--system", systemId);
  const commandArgs = [scriptPath, ...finalArgs];

  return enqueueQueueJob({
    label: commandLabel,
    systemId,
    requestId,
    sourceEventId,
    operationName: `script:${path.basename(scriptPath)}`,
    inputHash: sha256Text(
      JSON.stringify({
        command: "node",
        scriptPath,
        args: commandArgs,
        cwd: root,
        systemId: systemId || null,
      }),
    ),
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

function enqueueRefreshNamingDebtJob({ sysCtx, requestId, sourceEventId }) {
  return enqueueQueueJob({
    label: "refresh naming debt",
    systemId: sysCtx.systemId,
    operationName: "refresh:naming-debt",
    requestId,
    sourceEventId,
    inputHash: sha256Text(
      JSON.stringify({
        script: "refresh-naming-debt",
        systemId: sysCtx.systemId,
      }),
    ),
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
}

function enqueueReplayJobFromOperation({ operation, systemId, requestId, sourceEventId }) {
  const sysCtx = getSystemContext(systemId);
  const normalized = String(operation || "").trim();
  if (!normalized) throw new Error("Missing operation name.");
  const supportedByExactMatch = SUPPORTED_REPLAY_OPERATIONS.has(normalized);
  const supportedByRunPrefix = normalized.startsWith("run:");
  if (!supportedByExactMatch && !supportedByRunPrefix) {
    if (normalized.startsWith("script:")) {
      throw new Error(`Operation '${normalized}' requires parameters and cannot be replayed automatically.`);
    }
    throw new Error(`Replay is not supported for operation '${normalized}'.`);
  }

  if (normalized === "refresh:naming-debt") {
    return enqueueRefreshNamingDebtJob({ sysCtx, requestId, sourceEventId });
  }

  if (normalized.startsWith("script:")) {
    const scriptName = normalized.slice("script:".length).trim();
    if (REPLAYABLE_NPM_SCRIPTS.has(scriptName)) {
      return queueNpmScript({
        repoRoot: sysCtx.repoRoot,
        script: scriptName,
        systemId: sysCtx.systemId,
        requestId,
        sourceEventId,
      });
    }
    if (scriptName === "ds-health-snapshot.mjs") {
      return queueNodeJsonCommand({
        repoRoot: sysCtx.repoRoot,
        commandLabel:
          "node tooling/scripts/ds-health-snapshot.mjs --before-ref HEAD~1 --retention-days 120 --skip-diff false",
        scriptPath: sysCtx.healthSnapshotScriptPath,
        systemId: sysCtx.systemId,
        requestId,
        sourceEventId,
        scriptArgs: [
          "--before-ref",
          "HEAD~1",
          "--retention-days",
          "120",
          "--skip-diff",
          "false",
          "--format",
          "json",
        ],
      });
    }
    throw new Error(`Operation '${normalized}' requires parameters and cannot be replayed automatically.`);
  }

  if (normalized.startsWith("run:")) {
    const scriptName = normalized.slice("run:".length).trim();
    if (!scriptName) throw new Error("Invalid replay operation script name.");
    const args = ["run", scriptName, "--", "--system", sysCtx.systemId];
    const commandLabel = `npm ${args.join(" ")}`;
    return enqueueQueueJob({
      label: commandLabel,
      systemId: sysCtx.systemId,
      operationName: `run:${scriptName}`,
      requestId,
      sourceEventId,
      inputHash: sha256Text(
        JSON.stringify({
          command: "npm",
          args,
          cwd: sysCtx.repoRoot,
          systemId: sysCtx.systemId,
          scriptName,
          replay: sourceEventId,
        }),
      ),
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
  }

  throw new Error(`Replay is not supported for operation '${normalized}'.`);
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

registerSystemRoutes(app, {
  buildHealthPayload,
  failJson,
  readJsonBody,
  designSystemRepository,
  normalizeSystemId,
  ensureRelativeDir,
  normalizeFigmaApiTokenRef,
  normalizeCollectionList,
  summarizeDesignSystemsConfig,
  resolveSafeSystemPathsForDeletion,
  repoRoot,
  fsSync,
});

registerOperationsRoutes(app, {
  failJson,
  toFiniteTimestamp,
  OPS_HISTORY_MAX_LIMIT,
  OPS_HISTORY_DEFAULT_LIMIT,
  OPS_REGRESSION_MAX_LIMIT,
  OPS_REGRESSION_DEFAULT_LIMIT,
  OPS_REGRESSION_DEFAULT_MIN_SAMPLES,
  designSystemRepository,
  readOperationHistory,
  buildOperationRegressionsReport,
  createApiRequestId,
  readJsonBody,
  normalizeSystemId,
  findOperationEventById,
  enqueueReplayJobFromOperation,
  queueJobAcceptedPayload,
});

registerRegistryRoutes(app, {
  failJson,
  getSystemContext,
});

registerTokenGraphRoutes(app, {
  failJson,
  getSystemContext,
});

registerHealthRoutes(app, {
  failJson,
  getSystemContext,
});

registerAnalysisRoutes(app, {
  failJson,
  getSystemContext,
});

registerComponentSpecRoutes(app, {
  failJson,
  getSystemContext,
  isDevRuntime,
  readJsonBody,
  resolveRepoFilePath,
  sha256Text,
});

registerFileRoutes(app, {
  failJson,
  getSystemContext,
  resolveRepoFilePath,
  readTextFileLimited,
  findLineForQuery,
  buildSnippet,
  guessContentType,
  MAX_FILE_BYTES,
});

registerJobRoutes(app, {
  failJson,
  queueJobs,
  listQueueJobEvents,
  queueJobSnapshot,
  isQueueJobFinalStatus,
  cancelQueueJob,
  toQueueTerminalEvent,
  buildApiErrorPayload,
  MAX_RETAINED_EVENTS,
});

registerCommandRoutes(app, {
  failJson,
  createApiRequestId,
  readJsonBody,
  getSystemContext,
  queueJobAcceptedPayload,
  enqueueQueueJob,
  sha256Text,
  runQueuedSpawnCommand,
  queueNpmScript,
  enqueueRefreshNamingDebtJob,
  queueNodeJsonCommand,
  toBooleanString,
  toNumberString,
  validateGitRef,
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

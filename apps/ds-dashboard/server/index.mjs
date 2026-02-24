import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
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
import { registerSystemRoutes } from "./routes/system-routes.mjs";
import { registerOperationsRoutes } from "./routes/operations-routes.mjs";
import { registerRegistryRoutes } from "./routes/registry-routes.mjs";
import { registerTokenGraphRoutes } from "./routes/token-graph-routes.mjs";
import { registerHealthRoutes } from "./routes/health-routes.mjs";
import { runSpawnWithCapture } from "./lib/spawn-runner.mjs";

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
/** @type {Map<string, Promise<void>>} */
const operationLogWriteLocks = new Map();

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

function resolveOpsLogDir(systemId) {
  try {
    const ctx = designSystemRepository.resolveSystemContext(systemId);
    return path.join(ctx.paths.output, ".ops");
  } catch {
    const fallbackId = normalizeSystemId(systemId) || "_unknown";
    return path.join(repoRoot, "output", fallbackId, ".ops");
  }
}

function listOpsLogFiles(logDir) {
  try {
    const entries = fsSync.readdirSync(logDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && OPS_LOG_FILE_RE.test(entry.name))
      .map((entry) => {
        const absPath = path.join(logDir, entry.name);
        const stat = fsSync.statSync(absPath);
        return { name: entry.name, absPath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

function resolveWritableOpsLogPath(logDir, datePart, appendBytes) {
  let suffix = 0;
  while (suffix < 10_000) {
    const fileName = suffix === 0 ? `operations-${datePart}.ndjson` : `operations-${datePart}.${suffix}.ndjson`;
    const targetPath = path.join(logDir, fileName);
    try {
      const stat = fsSync.statSync(targetPath);
      if (stat.size + appendBytes <= OPS_LOG_MAX_FILE_BYTES) return targetPath;
    } catch {
      return targetPath;
    }
    suffix += 1;
  }
  return path.join(logDir, `operations-${datePart}.${Date.now()}.ndjson`);
}

async function cleanupOpsLogFiles(logDir) {
  const keepAfter = Date.now() - OPS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = listOpsLogFiles(logDir);
  await Promise.all(
    files.map(async (file) => {
      const match = OPS_LOG_FILE_RE.exec(file.name);
      if (!match) return;
      const dayTs = new Date(`${match[1]}T00:00:00.000Z`).getTime();
      if (!Number.isFinite(dayTs) || dayTs >= keepAfter) return;
      await fs.rm(file.absPath, { force: true });
    }),
  );
}

function enqueueOpsLogWrite(logDir, writeTask) {
  const previous = operationLogWriteLocks.get(logDir) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(writeTask)
    .finally(() => {
      if (operationLogWriteLocks.get(logDir) === next) {
        operationLogWriteLocks.delete(logDir);
      }
    });
  operationLogWriteLocks.set(logDir, next);
  return next;
}

async function appendOperationEvent(entry) {
  const timestamp = String(entry?.timestamp || nowIso());
  const datePart = timestamp.slice(0, 10);
  const logDir = resolveOpsLogDir(entry?.systemId);
  const normalized = {
    id: createOperationEventId(),
    timestamp,
    eventType: String(entry?.eventType || "operation.event"),
    operation: String(entry?.operation || "unknown"),
    system: String(entry?.systemId || ""),
    status: String(entry?.status || "unknown"),
    durationMs: Number.isFinite(entry?.durationMs) ? Number(entry.durationMs) : null,
    requestId: entry?.requestId ? String(entry.requestId) : null,
    jobId: entry?.jobId ? String(entry.jobId) : null,
    sourceEventId: entry?.sourceEventId ? String(entry.sourceEventId) : null,
    inputHash: entry?.inputHash ? String(entry.inputHash) : null,
    outputHash: entry?.outputHash ? String(entry.outputHash) : null,
    result: {
      ok: entry?.result?.ok === true,
      code:
        typeof entry?.result?.code === "number" || typeof entry?.result?.code === "string"
          ? entry.result.code
          : null,
      summary: entry?.result?.summary ? String(entry.result.summary) : null,
    },
  };
  const line = `${JSON.stringify(normalized)}\n`;
  const lineBytes = Buffer.byteLength(line, "utf8");

  await enqueueOpsLogWrite(logDir, async () => {
    await fs.mkdir(logDir, { recursive: true });
    const targetPath = resolveWritableOpsLogPath(logDir, datePart, lineBytes);
    await fs.appendFile(targetPath, line, "utf8");
    await cleanupOpsLogFiles(logDir);
  });
}

function appendOperationEventSafe(entry) {
  void appendOperationEvent(entry).catch((error) => {
    writeStructuredLog("warn", {
      event: "operations.history_write_failed",
      systemId: entry?.systemId ? String(entry.systemId) : null,
      operation: entry?.operation ? String(entry.operation) : null,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

function readOpsLogLines(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function toFiniteTimestamp(raw) {
  const iso = String(raw || "").trim();
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

function parseOperationEventLine(line, fallbackSystemId) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const timestamp = String(parsed.timestamp || "").trim();
  const operation = String(parsed.operation || "").trim();
  if (!timestamp || !operation) return null;
  if (!Number.isFinite(toFiniteTimestamp(timestamp))) return null;

  const result =
    parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
      ? parsed.result
      : null;
  const resultCode = result?.code;

  return {
    id: String(parsed.id || createOperationEventId()),
    timestamp,
    eventType: String(parsed.eventType || "operation.event"),
    operation,
    system: String(parsed.system ?? parsed.systemId ?? fallbackSystemId ?? ""),
    status: String(parsed.status || "unknown").trim().toLowerCase() || "unknown",
    durationMs:
      typeof parsed.durationMs === "number" && Number.isFinite(parsed.durationMs) && parsed.durationMs >= 0
        ? Math.round(parsed.durationMs)
        : null,
    requestId: parsed.requestId ? String(parsed.requestId) : null,
    jobId: parsed.jobId ? String(parsed.jobId) : null,
    sourceEventId: parsed.sourceEventId ? String(parsed.sourceEventId) : null,
    inputHash: parsed.inputHash ? String(parsed.inputHash) : null,
    outputHash: parsed.outputHash ? String(parsed.outputHash) : null,
    result: {
      ok: result?.ok === true,
      code: typeof resultCode === "number" || typeof resultCode === "string" ? resultCode : null,
      summary: result?.summary ? String(result.summary) : null,
    },
  };
}

function resolveOperationHistoryTargets(systemId) {
  /** @type {Array<{ systemId: string; logDir: string }>} */
  const targets = [];
  const normalizedSystemId = systemId ? String(systemId).trim() : "";
  if (normalizedSystemId) {
    targets.push({
      systemId: normalizedSystemId,
      logDir: resolveOpsLogDir(normalizedSystemId),
    });
    return targets;
  }

  const config = designSystemRepository.getConfig();
  for (const row of config.systems || []) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    targets.push({ systemId: id, logDir: resolveOpsLogDir(id) });
  }
  return targets;
}

function readOperationHistory({
  systemId,
  operation,
  status,
  from,
  to,
  limit,
}) {
  const maxRows = Math.max(1, Math.min(limit, OPS_HISTORY_MAX_LIMIT));
  const filters = {
    systemId: systemId ? String(systemId) : "",
    operation: operation ? String(operation).trim().toLowerCase() : "",
    status: status ? String(status).trim().toLowerCase() : "",
    fromTs: toFiniteTimestamp(from),
    toTs: toFiniteTimestamp(to),
  };
  const targets = resolveOperationHistoryTargets(filters.systemId);

  const events = [];
  let scannedRows = 0;
  let scannedFiles = 0;

  for (const target of targets) {
    const files = listOpsLogFiles(target.logDir);
    for (const file of files) {
      scannedFiles += 1;
      const lines = readOpsLogLines(file.absPath);
      for (const line of lines) {
        scannedRows += 1;
        const parsed = parseOperationEventLine(line, target.systemId);
        if (!parsed) continue;
        const eventTs = toFiniteTimestamp(parsed?.timestamp);
        if (Number.isFinite(filters.fromTs) && (!Number.isFinite(eventTs) || eventTs < filters.fromTs)) continue;
        if (Number.isFinite(filters.toTs) && (!Number.isFinite(eventTs) || eventTs > filters.toTs)) continue;
        const eventOperation = String(parsed?.operation || "").trim().toLowerCase();
        if (filters.operation && !eventOperation.includes(filters.operation)) continue;
        const eventStatus = String(parsed?.status || "").trim().toLowerCase();
        if (filters.status && eventStatus !== filters.status) continue;
        events.push(parsed);
      }
    }
  }

  events.sort((a, b) => {
    const aTs = toFiniteTimestamp(a?.timestamp);
    const bTs = toFiniteTimestamp(b?.timestamp);
    if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
    if (!Number.isFinite(aTs)) return 1;
    if (!Number.isFinite(bTs)) return -1;
    return bTs - aTs;
  });

  return {
    events: events.slice(0, maxRows),
    scannedRows,
    scannedFiles,
  };
}

function findOperationEventById({ eventId, systemId }) {
  const needle = String(eventId || "").trim();
  if (!needle) {
    return { event: null, scannedRows: 0, scannedFiles: 0 };
  }
  const targets = resolveOperationHistoryTargets(systemId);
  let scannedRows = 0;
  let scannedFiles = 0;

  for (const target of targets) {
    const files = listOpsLogFiles(target.logDir);
    for (const file of files) {
      scannedFiles += 1;
      const lines = readOpsLogLines(file.absPath);
      for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
        scannedRows += 1;
        const parsed = parseOperationEventLine(lines[idx], target.systemId);
        if (!parsed) continue;
        if (String(parsed.id || "").trim() !== needle) continue;
        return { event: parsed, scannedRows, scannedFiles };
      }
    }
  }
  return { event: null, scannedRows, scannedFiles };
}

function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let total = 0;
  for (const value of values) total += Number(value) || 0;
  return total / values.length;
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function isTerminalOperationStatus(status) {
  return status === "success" || status === "error" || status === "cancelled";
}

function normalizeFailureRate(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const failures = events.filter((event) => event.status === "error" || event.status === "cancelled").length;
  return failures / events.length;
}

function buildOperationRegressionsReport({ systemId, limit, minSamples }) {
  const history = readOperationHistory({
    systemId,
    limit,
  });

  /** @type {Map<string, any[]>} */
  const byOperation = new Map();
  for (const event of history.events) {
    const operation = String(event?.operation || "").trim();
    if (!operation) continue;
    const bucket = byOperation.get(operation) || [];
    bucket.push(event);
    byOperation.set(operation, bucket);
  }

  const regressions = [];
  let operationsAnalyzed = 0;

  for (const [operation, rows] of Array.from(byOperation.entries())) {
    operationsAnalyzed += 1;
    const terminalRows = rows.filter((row) => isTerminalOperationStatus(String(row?.status || "")));
    const successDurations = terminalRows
      .filter((row) => row.status === "success" && typeof row.durationMs === "number" && row.durationMs >= 0)
      .map((row) => Number(row.durationMs));
    const recentDuration = successDurations.slice(0, 5);
    const baselineDuration = successDurations.slice(5, 25);
    const recentDurationAvg = mean(recentDuration);
    const baselineDurationAvg = mean(baselineDuration);

    const recentTerminal = terminalRows.slice(0, 10);
    const baselineTerminal = terminalRows.slice(10, 40);
    const recentFailureRate = normalizeFailureRate(recentTerminal);
    const baselineFailureRate = normalizeFailureRate(baselineTerminal);

    const signals = [];
    let severityScore = 0;

    if (
      Number.isFinite(recentDurationAvg) &&
      Number.isFinite(baselineDurationAvg) &&
      baselineDuration.length >= minSamples &&
      recentDuration.length >= 2
    ) {
      const ratio = baselineDurationAvg > 0 ? recentDurationAvg / baselineDurationAvg : null;
      const deltaMs = recentDurationAvg - baselineDurationAvg;
      if (Number.isFinite(ratio) && ratio >= 1.5 && deltaMs >= 250) {
        severityScore += ratio >= 2 ? 2 : 1;
        signals.push({
          kind: "duration",
          severity: ratio >= 2 ? "high" : "medium",
          message: `Average duration increased from ${Math.round(baselineDurationAvg)}ms to ${Math.round(recentDurationAvg)}ms.`,
          metrics: {
            recentAvgDurationMs: Math.round(recentDurationAvg),
            baselineAvgDurationMs: Math.round(baselineDurationAvg),
            ratio: roundMetric(ratio),
          },
        });
      }
    }

    if (
      Number.isFinite(recentFailureRate) &&
      Number.isFinite(baselineFailureRate) &&
      baselineTerminal.length >= minSamples &&
      recentTerminal.length >= 3
    ) {
      const deltaFailure = recentFailureRate - baselineFailureRate;
      if (recentFailureRate >= 0.3 && deltaFailure >= 0.2) {
        severityScore += deltaFailure >= 0.4 ? 2 : 1;
        signals.push({
          kind: "failure_rate",
          severity: deltaFailure >= 0.4 ? "high" : "medium",
          message: `Failure rate increased from ${Math.round(baselineFailureRate * 100)}% to ${Math.round(recentFailureRate * 100)}%.`,
          metrics: {
            recentFailureRate: roundMetric(recentFailureRate),
            baselineFailureRate: roundMetric(baselineFailureRate),
            delta: roundMetric(deltaFailure),
          },
        });
      }
    }

    if (signals.length === 0) continue;

    const latest = rows[0] || null;
    regressions.push({
      operation,
      system: latest?.system || systemId || null,
      latestTimestamp: latest?.timestamp || null,
      latestStatus: latest?.status || null,
      severity: severityScore >= 3 ? "high" : "medium",
      signals,
      samples: {
        total: rows.length,
        terminal: terminalRows.length,
        recentDuration: recentDuration.length,
        baselineDuration: baselineDuration.length,
        recentFailure: recentTerminal.length,
        baselineFailure: baselineTerminal.length,
      },
    });
  }

  regressions.sort((left, right) => {
    const score = (regression) => (regression.severity === "high" ? 2 : 1);
    const bySeverity = score(right) - score(left);
    if (bySeverity !== 0) return bySeverity;
    const leftTs = toFiniteTimestamp(left.latestTimestamp);
    const rightTs = toFiniteTimestamp(right.latestTimestamp);
    if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) return 0;
    if (!Number.isFinite(leftTs)) return 1;
    if (!Number.isFinite(rightTs)) return -1;
    return rightTs - leftTs;
  });

  return {
    generatedAt: nowIso(),
    regressions,
    summary: {
      operationsAnalyzed,
      regressionsDetected: regressions.length,
      scannedRows: history.scannedRows,
      scannedFiles: history.scannedFiles,
    },
  };
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
    operation: job.operationName,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    systemId: job.systemId,
    requestId: job.requestId || null,
    sourceEventId: job.sourceEventId || null,
    result: job.result,
  };
}

function queueJobAcceptedPayload(job) {
  return {
    ok: true,
    accepted: true,
    jobId: job.id,
    requestId: job.requestId || null,
    status: job.status,
    statusUrl: `/api/jobs/${job.id}`,
    streamUrl: `/api/jobs/${job.id}/stream`,
    job: queueJobSnapshot(job),
  };
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

function toQueueTerminalEvent(job) {
  const status = isQueueJobFinalStatus(job?.status) ? job.status : "error";
  const result = job?.result && typeof job.result === "object" ? job.result : {};
  const explicitCode = Number(result.code);
  const code = Number.isFinite(explicitCode) ? explicitCode : status === "success" ? 0 : 1;
  const summary = String(result.summary || "").trim() || (status === "success" ? "Completed successfully." : "Unknown error.");
  return {
    type: "end",
    status,
    code,
    summary,
    payload: result.payload,
  };
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
  const result = await runSpawnWithCapture({
    cwd: args.cwd,
    command: args.command,
    commandArgs: args.commandArgs,
    parseJsonStdout: true,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  });

  if (result.spawnError) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        message: result.spawnError,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }

  if (result.jsonParseError) {
    return {
      ok: false,
      statusCode: 500,
      payload: {
        ok: false,
        command: args.commandLabel,
        message: "Command returned invalid JSON.",
        stdout: result.stdout,
        stderr: result.stderr,
        parse_error: result.jsonParseError,
      },
    };
  }

  return {
    ok: true,
    statusCode: 200,
    payload: result.parsedJson,
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
    const loaded = await loadJsonArtifactOrError(c, {
      filePath: sysCtx.namingDebtCachePath,
      artifactName: "naming debt cache",
      allowMissing: true,
      missingValue: null,
    });
    if (!loaded.ok) return loaded.response;
    if (loaded.value && typeof loaded.value === "object") {
      return c.json(loaded.value);
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
    const writeJsonEvent = async (payload) => {
      await stream.writeSSE({ data: JSON.stringify(payload) });
    };
    let cursor = since;
    const deadline = Date.now() + 25 * 60 * 1000;

    while (Date.now() < deadline) {
      const job = queueJobs.get(jobId);
      if (!job) {
        await writeJsonEvent({
          type: "error",
          ...buildApiErrorPayload({
            code: "queue.job_not_found",
            userMessage: `Job '${jobId}' not found.`,
            recoverable: true,
            context: { jobId },
          }),
        });
        await writeJsonEvent({
          type: "end",
          status: "error",
          code: 404,
          summary: `Job '${jobId}' not found.`,
        });
        return;
      }

      const events = listQueueJobEvents(job, {
        since: cursor,
        limit: MAX_RETAINED_EVENTS,
      });
      for (const event of events) {
        cursor = Math.max(cursor, Number(event.seq) || cursor);
        await writeJsonEvent(event);
      }

      if (isQueueJobFinalStatus(job.status)) {
        if (events.length === 0) {
          await writeJsonEvent(toQueueTerminalEvent(job));
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }

    await writeJsonEvent({
      type: "error",
      ...buildApiErrorPayload({
        code: "queue.stream_timeout",
        userMessage: "Stream timeout waiting for job completion.",
        recoverable: true,
        context: { jobId },
      }),
    });
    await writeJsonEvent({
      type: "end",
      status: "error",
      code: 408,
      summary: "Stream timeout waiting for job completion.",
    });
  });
});

app.post("/api/run/:script", async (c) => {
  const requestId = createApiRequestId();
  const scriptName = String(c.req.param("script") || "").trim();
  if (!scriptName) {
    return failJson(c, 400, {
      code: "validation.missing_script_name",
      userMessage: "Missing script name in URL.",
      recoverable: true,
      requestId,
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
    operationName: `run:${scriptName}`,
    requestId,
    inputHash: sha256Text(
      JSON.stringify({
        command: "npm",
        args,
        cwd: sysCtx.repoRoot,
        systemId: sysCtx.systemId,
        scriptName,
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

  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-registry", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:registry:refresh",
    systemId: sysCtx.systemId,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-usage-index", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-usage-index",
    systemId: sysCtx.systemId,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-graph", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-graph",
    systemId: sysCtx.systemId,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-token-health", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:token-health",
    systemId: sysCtx.systemId,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-components-health", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = queueNpmScript({
    repoRoot: sysCtx.repoRoot,
    script: "ds:registry:report",
    systemId: sysCtx.systemId,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/refresh-naming-debt", (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const job = enqueueRefreshNamingDebtJob({
    sysCtx,
    requestId,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/capture-health-snapshot", async (c) => {
  const requestId = createApiRequestId();
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
      requestId,
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
    requestId,
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
  const requestId = createApiRequestId();
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
    requestId,
    scriptArgs: commandArgs,
    allowNonZeroJson: true,
  });
  return c.json(queueJobAcceptedPayload(job), 202);
});

app.post("/api/capture-figma-screenshot", async (c) => {
  const requestId = createApiRequestId();
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const body = await readJsonBody(c);
  const figmaUrl = String(body.figmaUrl ?? body.url ?? "").trim();
  if (!figmaUrl) {
    return failJson(c, 400, {
      code: "validation.figma_url_required",
      userMessage: "figmaUrl is required in request body.",
      recoverable: true,
      context: { field: "figmaUrl" },
      requestId,
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
      requestId,
    });
  }
  const host = String(parsedUrl.hostname || "").toLowerCase();
  if (host !== "figma.com" && !host.endsWith(".figma.com")) {
    return failJson(c, 400, {
      code: "validation.invalid_figma_host",
      userMessage: `URL host is not figma.com: ${host}`,
      recoverable: true,
      context: { host, figmaUrl },
      requestId,
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
    requestId,
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

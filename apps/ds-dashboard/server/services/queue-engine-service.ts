import { EventEmitter } from "node:events";

import { isQueueJobFinalStatus, type QueueJob } from "../lib/queue-utils.ts";

export interface QueueEngineServiceConfig {
  jobQueueConcurrency: number;
  jobTimeoutMs: number;
  jobRetentionMs: number;
  maxRetainedEvents: number;
  maxRetainedJobs: number;
  nowIso: () => string;
  onOperationEvent?: (entry: Record<string, unknown>) => void;
  createQueueJobId?: () => string;
  hashUnknown?: (value: unknown) => string | null;
  operationDurationMs?: (startedAt?: string, finishedAt?: string) => number | null;
  operationResultSummary?: (result: unknown) => string;
}

export interface QueueEngineJob
  extends Omit<QueueJob, "requestId" | "events" | "result"> {
  requestId: string | null;
  priority: number;
  process?: { killed?: boolean; kill: (signal?: string) => void } | undefined;
  emitter: EventEmitter;
  nextSeq: number;
  events: Array<{ seq: number; [key: string]: unknown }>;
  startedAt?: string;
  finishedAt?: string;
  result?: {
    ok: boolean;
    code?: number;
    summary?: string;
    payload?: Record<string, unknown>;
  };
  execute: (args: {
    emitChunk: (kind: string, text: string) => void;
    setProcess: (process: { killed?: boolean; kill: (signal?: string) => void } | undefined) => void;
    isCancelled: () => boolean;
  }) => Promise<{ ok: boolean; code?: number; summary?: string; payload?: Record<string, unknown> }>;
}

export interface QueueEngineServiceResult {
  queueJobs: Map<string, QueueEngineJob>;
  queueMetrics: () => { active: number; pending: number; total: number };
  enqueueQueueJob: (payload: {
    label: string;
    systemId: string;
    priority?: "normal" | "high";
    operationName: string;
    requestId?: string;
    sourceEventId?: string;
    inputHash?: string;
    execute: QueueEngineJob["execute"];
  }) => QueueEngineJob;
  cancelQueueJob: (jobId: string) => { ok: boolean; message?: string };
  cleanupQueueJobs: () => void;
}

function defaultOperationDurationMs(startedAt?: string, finishedAt?: string): number | null {
  const startTs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endTs = finishedAt ? new Date(finishedAt).getTime() : NaN;
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return null;
  return endTs - startTs;
}

function defaultOperationResultSummary(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  const summary = String(record.summary ?? "").trim();
  if (summary) return summary;
  const payload = record.payload && typeof record.payload === "object" ? record.payload as Record<string, unknown> : null;
  const payloadMessage = String(payload?.message ?? payload?.error ?? "").trim();
  if (payloadMessage) return payloadMessage;
  return "";
}

function defaultHashUnknown(value: unknown): string | null {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function defaultCreateQueueJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createQueueEngineService(config: QueueEngineServiceConfig): QueueEngineServiceResult {
  const {
    jobQueueConcurrency,
    jobTimeoutMs,
    jobRetentionMs,
    maxRetainedEvents,
    maxRetainedJobs,
    nowIso,
    onOperationEvent,
    createQueueJobId = defaultCreateQueueJobId,
    hashUnknown = defaultHashUnknown,
    operationDurationMs = defaultOperationDurationMs,
    operationResultSummary = defaultOperationResultSummary,
  } = config;

  const queueJobs = new Map<string, QueueEngineJob>();
  const queuePendingIds: string[] = [];
  let queueActiveCount = 0;
  const queueActiveSystemIds = new Set<string>();

  function getQueueJobLockKey(systemId: string): string | null {
    const normalized = String(systemId || "").trim();
    return normalized || null;
  }

  function pickPendingJob(minPriority: number) {
    for (let index = 0; index < queuePendingIds.length; index += 1) {
      const jobId = queuePendingIds[index];
      const job = queueJobs.get(jobId);
      if (!job || job.status !== "queued") continue;
      const lockKey = getQueueJobLockKey(job.systemId);
      if (lockKey && queueActiveSystemIds.has(lockKey)) continue;
      if (job.priority < minPriority) continue;
      return { index, job };
    }
    return null;
  }

  function queueMetrics() {
    return {
      active: queueActiveCount,
      pending: queuePendingIds.length,
      total: queueJobs.size,
    };
  }

  function appendQueueJobEvent(job: QueueEngineJob, event: Record<string, unknown>) {
    const fullEvent = {
      ...event,
      seq: job.nextSeq,
      at: nowIso(),
    };
    job.nextSeq += 1;
    job.events.push(fullEvent);
    if (job.events.length > maxRetainedEvents) {
      job.events.splice(0, job.events.length - maxRetainedEvents);
    }
    job.emitter.emit("event", fullEvent);
    return fullEvent;
  }

  function emitOperationEvent(entry: Record<string, unknown>) {
    if (typeof onOperationEvent !== "function") return;
    onOperationEvent(entry);
  }

  function cleanupQueueJobs() {
    const now = Date.now();

    for (const [jobId, job] of Array.from(queueJobs.entries())) {
      if (!isQueueJobFinalStatus(job.status)) continue;
      const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : NaN;
      if (Number.isFinite(finishedAt) && now - finishedAt > jobRetentionMs) {
        queueJobs.delete(jobId);
      }
    }

    if (queueJobs.size <= maxRetainedJobs) return;
    const removable = Array.from(queueJobs.values())
      .filter((job) => isQueueJobFinalStatus(job.status))
      .sort((a, b) => {
        const aTs = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
        const bTs = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
        return aTs - bTs;
      });
    while (queueJobs.size > maxRetainedJobs && removable.length > 0) {
      const job = removable.shift();
      if (!job) break;
      queueJobs.delete(job.id);
    }
  }

  function scheduleQueueJobs() {
    while (queueActiveCount < jobQueueConcurrency && queuePendingIds.length > 0) {
      const pickedJob = pickPendingJob(1) ?? pickPendingJob(0);
      if (!pickedJob) break;

      queuePendingIds.splice(pickedJob.index, 1);
      void runQueueJob(pickedJob.job);
    }
  }

  async function runQueueJob(job: QueueEngineJob) {
    queueActiveCount += 1;
    const lockKey = getQueueJobLockKey(job.systemId);
    if (lockKey) queueActiveSystemIds.add(lockKey);
    job.status = "running";
    job.startedAt = nowIso();
    appendQueueJobEvent(job, { type: "status", status: "running" });
    emitOperationEvent({
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
    const timeoutMessage = `Job timed out after ${Math.round(jobTimeoutMs / 1000)} seconds.`;
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
    }, jobTimeoutMs);

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
        emitOperationEvent({
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
        emitOperationEvent({
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
      emitOperationEvent({
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
      const structuredError =
        error && typeof error === "object" && !Array.isArray(error)
          ? (error as Record<string, unknown>)
          : null;
      const structuredCode =
        structuredError && typeof structuredError.code === "string"
          ? String(structuredError.code)
          : "";
      const isSupportedStructuredCode =
        structuredCode === "sync.component_proofs_required_failed";
      const structuredContext =
        structuredError &&
        structuredError.context &&
        typeof structuredError.context === "object" &&
        !Array.isArray(structuredError.context)
          ? structuredError.context
          : null;
      const structuredMessage =
        structuredError && typeof structuredError.message === "string"
          ? String(structuredError.message)
          : "";
      const message = didTimeout
        ? timeoutMessage
        : structuredMessage ||
          (error instanceof Error ? error.message : String(error || "Unknown queue error."));
      const includeStructuredFields = isSupportedStructuredCode && (structuredCode || structuredContext);
      const errorPayload = includeStructuredFields
        ? {
            ...(isSupportedStructuredCode && structuredCode ? { code: structuredCode } : {}),
            ...(isSupportedStructuredCode && structuredContext ? { context: structuredContext } : {}),
            ...(structuredMessage ? { message: structuredMessage } : {}),
          }
        : undefined;
      job.status = "error";
      job.result = {
        ok: false,
        code: didTimeout ? 124 : 1,
        summary: message || "Unknown queue error.",
        ...(errorPayload ? { payload: errorPayload } : {}),
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
        ...(errorPayload ? { payload: errorPayload } : {}),
      });
      emitOperationEvent({
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
      if (lockKey) queueActiveSystemIds.delete(lockKey);
      scheduleQueueJobs();
      cleanupQueueJobs();
    }
  }

  function enqueueQueueJob({
    label,
    systemId,
    operationName,
    priority = "normal",
    requestId,
    sourceEventId,
    inputHash,
    execute,
  }: {
    label: string;
    systemId: string;
    operationName: string;
    priority?: "normal" | "high";
    requestId?: string;
    sourceEventId?: string;
    inputHash?: string;
    execute: QueueEngineJob["execute"];
  }): QueueEngineJob {
    const job: QueueEngineJob = {
      id: createQueueJobId(),
      label,
      systemId,
      operationName: String(operationName || label || "unknown.operation"),
      priority: priority === "high" ? 1 : 0,
      status: "queued",
      createdAt: nowIso(),
      requestId: requestId ? String(requestId) : null,
      sourceEventId: sourceEventId ? String(sourceEventId) : null,
      inputHash: inputHash ? String(inputHash) : hashUnknown({ label, systemId }) || "",
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
    emitOperationEvent({
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

  function cancelQueueJob(jobId: string) {
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
      emitOperationEvent({
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

  return {
    queueJobs,
    queueMetrics,
    enqueueQueueJob,
    cancelQueueJob,
    cleanupQueueJobs,
  };
}

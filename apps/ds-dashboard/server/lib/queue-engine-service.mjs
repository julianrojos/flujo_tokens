import { EventEmitter } from "node:events";

import { isQueueJobFinalStatus } from "./queue-utils.mjs";

function defaultOperationDurationMs(startedAt, finishedAt) {
  const startTs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endTs = finishedAt ? new Date(finishedAt).getTime() : NaN;
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs < startTs) return null;
  return endTs - startTs;
}

function defaultOperationResultSummary(result) {
  if (!result || typeof result !== "object") return "";
  const summary = String(result.summary ?? "").trim();
  if (summary) return summary;
  const payload = result.payload && typeof result.payload === "object" ? result.payload : null;
  const payloadMessage = String(payload?.message ?? payload?.error ?? "").trim();
  if (payloadMessage) return payloadMessage;
  return "";
}

function defaultHashUnknown(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function defaultCreateQueueJobId() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createQueueEngineService(config) {
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

  function appendQueueJobEvent(job, event) {
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

  function emitOperationEvent(entry) {
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
      scheduleQueueJobs();
      cleanupQueueJobs();
    }
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

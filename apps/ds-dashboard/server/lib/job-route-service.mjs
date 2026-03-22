export function decodeJobId(rawJobId) {
  return decodeURIComponent(String(rawJobId || ""));
}

function parseInteger(raw, fallback) {
  const parsed = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJobEventsCursor(rawSince) {
  return Math.max(0, parseInteger(rawSince, 0));
}

export function parseJobEventsPage(rawSince, rawLimit, options = {}) {
  const defaultLimit = Number.isFinite(options.defaultLimit) ? options.defaultLimit : 300;
  const maxLimit = Number.isFinite(options.maxLimit) ? options.maxLimit : 1_000;
  const since = parseJobEventsCursor(rawSince);
  const limit = Math.max(1, Math.min(parseInteger(rawLimit, defaultLimit), maxLimit));
  return { since, limit };
}

export function buildQueueJobNotFoundErrorArgs(jobId) {
  return {
    code: "queue.job_not_found",
    userMessage: `Job '${jobId}' not found.`,
    recoverable: true,
    context: { jobId },
  };
}

export function buildQueueJobNotCancelableErrorArgs({ jobId, status, message }) {
  return {
    code: "queue.job_not_cancelable",
    userMessage: String(message || "Job cannot be cancelled."),
    recoverable: true,
    context: { jobId, status },
  };
}

export function getQueueNextCursor(job) {
  return job.events.length > 0 ? job.events[job.events.length - 1].seq : Math.max(0, job.nextSeq - 1);
}

export function buildQueueJobStatePayload({ job, events, queueJobSnapshotFn, isQueueJobFinalStatusFn }) {
  return {
    ok: true,
    job: queueJobSnapshotFn(job),
    done: isQueueJobFinalStatusFn(job.status),
    events,
    nextCursor: getQueueNextCursor(job),
  };
}

export function buildQueueMissingJobStreamEvents({ jobId, buildApiErrorPayloadFn }) {
  return {
    errorEvent: {
      type: "error",
      ...buildApiErrorPayloadFn(buildQueueJobNotFoundErrorArgs(jobId)),
    },
    endEvent: {
      type: "end",
      status: "error",
      code: 404,
      summary: `Job '${jobId}' not found.`,
    },
  };
}

export function buildQueueStreamTimeoutEvents({ jobId, buildApiErrorPayloadFn }) {
  return {
    errorEvent: {
      type: "error",
      ...buildApiErrorPayloadFn({
        code: "queue.stream_timeout",
        userMessage: "Stream timeout waiting for job completion.",
        recoverable: true,
        context: { jobId },
      }),
    },
    endEvent: {
      type: "end",
      status: "error",
      code: 408,
      summary: "Stream timeout waiting for job completion.",
    },
  };
}

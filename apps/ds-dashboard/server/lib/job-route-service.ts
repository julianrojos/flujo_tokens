export interface QueueJobEvent {
  seq: number;
}

export interface QueueJobLike {
  id?: string;
  status: string;
  events: QueueJobEvent[];
  nextSeq: number;
}

export interface QueueJobNotCancelableArgs {
  jobId: string;
  status: string;
  message: string;
}

export interface QueueJobStatePayloadArgs {
  job: QueueJobLike;
  events: unknown[];
  queueJobSnapshotFn: (job: QueueJobLike) => unknown;
  isQueueJobFinalStatusFn: (status: string) => boolean;
}

export interface BuildApiErrorPayloadFn {
  (args: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context: Record<string, unknown>;
  }): {
    ok: boolean;
    error: Record<string, unknown>;
  };
}

export interface QueueJobStreamEventArgs {
  jobId: string;
  buildApiErrorPayloadFn: BuildApiErrorPayloadFn;
}

export function decodeJobId(rawJobId: string): string {
  return decodeURIComponent(String(rawJobId || ""));
}

function parseInteger(raw: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJobEventsCursor(rawSince: unknown): number {
  return Math.max(0, parseInteger(rawSince, 0));
}

export function parseJobEventsPage(
  rawSince: unknown,
  rawLimit: unknown,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): { since: number; limit: number } {
  const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 300;
  const maxLimit = Number.isFinite(options.maxLimit) ? Number(options.maxLimit) : 1_000;
  const since = parseJobEventsCursor(rawSince);
  const limit = Math.max(1, Math.min(parseInteger(rawLimit, defaultLimit), maxLimit));
  return { since, limit };
}

export function buildQueueJobNotFoundErrorArgs(jobId: string): {
  code: string;
  userMessage: string;
  recoverable: boolean;
  context: { jobId: string };
} {
  return {
    code: "queue.job_not_found",
    userMessage: `Job '${jobId}' not found.`,
    recoverable: true,
    context: { jobId },
  };
}

export function buildQueueJobNotCancelableErrorArgs({
  jobId,
  status,
  message,
}: QueueJobNotCancelableArgs): {
  code: string;
  userMessage: string;
  recoverable: boolean;
  context: { jobId: string; status: string };
} {
  return {
    code: "queue.job_not_cancelable",
    userMessage: String(message || "Job cannot be cancelled."),
    recoverable: true,
    context: { jobId, status },
  };
}

export function getQueueNextCursor(job: QueueJobLike): number {
  return job.events.length > 0 ? job.events[job.events.length - 1].seq : Math.max(0, job.nextSeq - 1);
}

export function buildQueueJobStatePayload({
  job,
  events,
  queueJobSnapshotFn,
  isQueueJobFinalStatusFn,
}: QueueJobStatePayloadArgs): {
  ok: true;
  job: unknown;
  done: boolean;
  events: unknown[];
  nextCursor: number;
} {
  return {
    ok: true,
    job: queueJobSnapshotFn(job),
    done: isQueueJobFinalStatusFn(job.status),
    events,
    nextCursor: getQueueNextCursor(job),
  };
}

export function buildQueueMissingJobStreamEvents({
  jobId,
  buildApiErrorPayloadFn,
}: QueueJobStreamEventArgs): {
  errorEvent: { type: "error"; ok: boolean; error: Record<string, unknown> };
  endEvent: { type: "end"; status: "error"; code: number; summary: string };
} {
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

export function buildQueueStreamTimeoutEvents({
  jobId,
  buildApiErrorPayloadFn,
}: QueueJobStreamEventArgs): {
  errorEvent: { type: "error"; ok: boolean; error: Record<string, unknown> };
  endEvent: { type: "end"; status: "error"; code: number; summary: string };
} {
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

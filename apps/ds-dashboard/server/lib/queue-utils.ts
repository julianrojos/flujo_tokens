/**
 * Queue Utils
 *
 * Utilities for queue job management and event handling.
 * Migrated from apps/ds-dashboard/server/lib/queue-utils.mjs
 */

export interface QueueJob {
  id: string;
  label: string;
  operationName: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  systemId: string;
  requestId?: string;
  sourceEventId?: string | null;
  result?: Record<string, unknown>;
  events?: Array<{ seq: number }>;
}

export interface QueueJobSnapshot {
  id: string;
  label: string;
  operation: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  systemId: string;
  requestId: string | null;
  sourceEventId: string | null;
  result?: Record<string, unknown>;
}

export interface QueueJobAcceptedPayload {
  ok: boolean;
  accepted: boolean;
  jobId: string;
  requestId: string | null;
  status: string;
  statusUrl: string;
  streamUrl: string;
  job: QueueJobSnapshot;
}

export interface QueueTerminalEvent {
  type: string;
  status: string;
  code: number;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface ListQueueJobEventsArgs {
  since?: number;
  limit?: number;
}

/**
 * Check if a queue job status is final (terminal).
 */
export function isQueueJobFinalStatus(status: string): boolean {
  return status === 'success' || status === 'error' || status === 'cancelled';
}

/**
 * Create a snapshot of a queue job.
 */
export function queueJobSnapshot(job: QueueJob): QueueJobSnapshot {
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

/**
 * Create an accepted job payload with status and stream URLs.
 */
export function queueJobAcceptedPayload(job: QueueJob): QueueJobAcceptedPayload {
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

/**
 * List queue job events with optional filtering.
 */
export function listQueueJobEvents(job: QueueJob, args: ListQueueJobEventsArgs = {}): Array<{ seq: number }> {
  const since = Number.isFinite(args.since as number) ? Number(args.since) : 0;
  const limit = Number.isFinite(args.limit as number) ? Math.max(1, Number(args.limit)) : 300;
  const filtered = (job.events || []).filter((event) => event.seq > since);
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
}

/**
 * Convert a payload to a queue summary string.
 */
export function toQueueSummaryFromPayload(payload: Record<string, unknown>, fallbackCode: number): string {
  const row = payload && typeof payload === 'object' ? payload : {};
  const topLevelMessage = String(row.message ?? '').trim();
  const topLevelError = String(row.error ?? '').trim();
  const sync = row.sync && typeof row.sync === 'object' ? (row.sync as Record<string, unknown>) : null;
  const syncError = String((sync as any)?.error ?? '').trim();
  const syncReason = String((sync as any)?.reason ?? '').trim();
  const explicitCode = Number(row.code ?? (row as any).exit_code ?? fallbackCode);
  const codeText = Number.isFinite(explicitCode) ? `Failed with code ${explicitCode}` : 'Unknown error';
  return topLevelMessage || topLevelError || syncError || syncReason || codeText;
}

/**
 * Normalize a job result to a terminal event.
 */
export function toQueueTerminalEvent(job: Partial<QueueJob>): QueueTerminalEvent {
  const status = isQueueJobFinalStatus(job?.status || '') ? job.status : 'error';
  const result = job?.result && typeof job.result === 'object' ? job.result : {};
  const explicitCode = Number((result as any)?.code);
  const code = Number.isFinite(explicitCode) ? explicitCode : status === 'success' ? 0 : 1;
  const summary =
    String((result as any)?.summary || '').trim() ||
    (status === 'success' ? 'Completed successfully.' : 'Unknown error.');
  return {
    type: 'end',
    status: status || 'error',
    code,
    summary,
    payload: (result as any)?.payload,
  };
}

import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import {
  buildQueueJobNotCancelableErrorArgs,
  buildQueueJobNotFoundErrorArgs,
  buildQueueJobStatePayload,
  buildQueueMissingJobStreamEvents,
  buildQueueStreamTimeoutEvents,
  decodeJobId,
  parseJobEventsCursor,
  parseJobEventsPage,
} from "../lib/job-route-service.ts";
import { DesignSystemSyncJobRepository } from "../db/design-system-sync-job-repository.ts";
import type { JobDeps } from "../lib/register-all-routes-service.ts";

export type JobRouteDeps = JobDeps;

export interface JobRouteEntry {
  id: string;
  status: string;
  events?: Array<{ seq: number; [key: string]: unknown }>;
  nextSeq: number;
  requestId?: string | null;
  [key: string]: unknown;
}

function isMissingDesignSystemSyncJobsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(?:relation|table)\s+"?design_system_sync_jobs"?\s+does not exist/i.test(
    message,
  );
}

export async function handleGetJobRoute(c: Context, deps: JobRouteDeps): Promise<Response> {
  const {
    failJson,
    queueJobs,
    listQueueJobEvents,
    queueJobSnapshot,
    isQueueJobFinalStatus,
    db,
  } = deps;
  const jobId = decodeJobId(c.req.param("jobId"));
  const job = queueJobs.get(jobId) as JobRouteEntry | undefined;
  if (job) {
    const { since, limit } = parseJobEventsPage(c.req.query("since"), c.req.query("limit"));
    const events = listQueueJobEvents(job, { since, limit });
    return c.json(
      buildQueueJobStatePayload({
        job,
        events,
        queueJobSnapshotFn: queueJobSnapshot,
        isQueueJobFinalStatusFn: isQueueJobFinalStatus,
      }),
    );
  }

  if (db) {
    const syncJobRepo = new DesignSystemSyncJobRepository(db);
    try {
      const syncJob = await syncJobRepo.getJob(jobId);
      if (!syncJob) {
        return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId)) as Response;
      }
      return c.json({
        ok: true,
        job: {
          id: syncJob.id,
          label: syncJob.label,
          operation: syncJob.operation,
          status: syncJob.status,
          createdAt: syncJob.createdAt,
          startedAt: syncJob.startedAt,
          finishedAt: syncJob.finishedAt,
          systemId: syncJob.systemId,
          requestId: syncJob.requestId,
          sourceEventId: syncJob.sourceEventId,
          result: syncJob.result,
        },
        done: isQueueJobFinalStatus(syncJob.status),
        events: [],
        nextCursor: 0,
      });
    } catch (error) {
      if (isMissingDesignSystemSyncJobsTableError(error)) {
        return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId)) as Response;
      }
      return failJson(c, 500, {
        code: 'internal.job_lookup_failed',
        userMessage: 'Failed to load queued job state.',
        recoverable: false,
      }) as Response;
    }
  }

  return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId)) as Response;
}

export function handleDeleteJobRoute(c: Context, deps: JobRouteDeps): Response {
  const { failJson, queueJobs, cancelQueueJob, queueJobSnapshot } = deps;
  const jobId = decodeJobId(c.req.param("jobId"));
  const job = queueJobs.get(jobId) as JobRouteEntry | undefined;
  if (!job) {
    return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId)) as Response;
  }

  const cancelled = cancelQueueJob(jobId) as { ok?: boolean; message?: string };
  if (!cancelled.ok) {
    return failJson(
      c,
      409,
      buildQueueJobNotCancelableErrorArgs({
        jobId,
        status: job.status,
        message: cancelled.message,
      }),
    ) as Response;
  }
  return c.json({ ok: true, job: queueJobSnapshot(job) });
}

export function handleStreamJobRoute(c: Context, deps: JobRouteDeps): Response {
  const {
    failJson,
    queueJobs,
    listQueueJobEvents,
    isQueueJobFinalStatus,
    toQueueTerminalEvent,
    buildApiErrorPayload,
    MAX_RETAINED_EVENTS,
  } = deps;
  const jobId = decodeJobId(c.req.param("jobId"));
  const since = parseJobEventsCursor(c.req.query("since"));
  const existing = queueJobs.get(jobId) as JobRouteEntry | undefined;
  if (!existing) {
    return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId)) as Response;
  }

  return streamSSE(c, async (stream) => {
    const writeJsonEvent = async (payload: unknown) => {
      await stream.writeSSE({ data: JSON.stringify(payload) });
    };
    let cursor = since;
    const deadline = Date.now() + 25 * 60 * 1000;

    while (Date.now() < deadline) {
      const job = queueJobs.get(jobId) as JobRouteEntry | undefined;
      if (!job) {
        const missing = buildQueueMissingJobStreamEvents({
          jobId,
          buildApiErrorPayloadFn: buildApiErrorPayload,
        });
        await writeJsonEvent(missing.errorEvent);
        await writeJsonEvent(missing.endEvent);
        return;
      }

      const events = listQueueJobEvents(job, {
        since: cursor,
        limit: MAX_RETAINED_EVENTS,
      });
      for (const event of events) {
        cursor = Math.max(cursor, Number((event as { seq?: unknown }).seq) || cursor);
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

    const timeout = buildQueueStreamTimeoutEvents({
      jobId,
      buildApiErrorPayloadFn: buildApiErrorPayload,
    });
    await writeJsonEvent(timeout.errorEvent);
    await writeJsonEvent(timeout.endEvent);
  });
}

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
} from "../lib/job-route-service.mjs";

export function handleGetJobRoute(c, deps) {
  const { failJson, queueJobs, listQueueJobEvents, queueJobSnapshot, isQueueJobFinalStatus } = deps;
  const jobId = decodeJobId(c.req.param("jobId"));
  const job = queueJobs.get(jobId);
  if (!job) {
    return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId));
  }

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

export function handleDeleteJobRoute(c, deps) {
  const { failJson, queueJobs, cancelQueueJob, queueJobSnapshot } = deps;
  const jobId = decodeJobId(c.req.param("jobId"));
  const job = queueJobs.get(jobId);
  if (!job) {
    return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId));
  }

  const cancelled = cancelQueueJob(jobId);
  if (!cancelled.ok) {
    return failJson(
      c,
      409,
      buildQueueJobNotCancelableErrorArgs({
        jobId,
        status: job.status,
        message: cancelled.message,
      }),
    );
  }
  return c.json({ ok: true, job: queueJobSnapshot(job) });
}

export function handleStreamJobRoute(c, deps) {
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
  const existing = queueJobs.get(jobId);
  if (!existing) {
    return failJson(c, 404, buildQueueJobNotFoundErrorArgs(jobId));
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

    const timeout = buildQueueStreamTimeoutEvents({
      jobId,
      buildApiErrorPayloadFn: buildApiErrorPayload,
    });
    await writeJsonEvent(timeout.errorEvent);
    await writeJsonEvent(timeout.endEvent);
  });
}

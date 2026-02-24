import { streamSSE } from "hono/streaming";

export function registerJobRoutes(app, deps) {
  const {
    failJson,
    queueJobs,
    listQueueJobEvents,
    queueJobSnapshot,
    isQueueJobFinalStatus,
    cancelQueueJob,
    toQueueTerminalEvent,
    buildApiErrorPayload,
    MAX_RETAINED_EVENTS,
  } = deps;

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
}

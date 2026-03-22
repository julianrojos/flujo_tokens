import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQueueJobNotCancelableErrorArgs,
  buildQueueJobNotFoundErrorArgs,
  buildQueueJobStatePayload,
  buildQueueMissingJobStreamEvents,
  buildQueueStreamTimeoutEvents,
  decodeJobId,
  getQueueNextCursor,
  parseJobEventsCursor,
  parseJobEventsPage,
} from "./job-route-service.mjs";

test("job-route-service: decodeJobId decodes route params", () => {
  assert.equal(decodeJobId("job%2Fabc"), "job/abc");
  assert.equal(decodeJobId(""), "");
});

test("job-route-service: parse helpers normalize cursor and page", () => {
  assert.equal(parseJobEventsCursor("5"), 5);
  assert.equal(parseJobEventsCursor("-10"), 0);
  assert.equal(parseJobEventsCursor("bad"), 0);

  assert.deepEqual(parseJobEventsPage("4", "20"), { since: 4, limit: 20 });
  assert.deepEqual(parseJobEventsPage("4", "99999"), { since: 4, limit: 1000 });
  assert.deepEqual(parseJobEventsPage("", ""), { since: 0, limit: 300 });
});

test("job-route-service: error payload builders keep API shape", () => {
  const notFound = buildQueueJobNotFoundErrorArgs("job-1");
  assert.equal(notFound.code, "queue.job_not_found");
  assert.equal(notFound.context.jobId, "job-1");

  const notCancelable = buildQueueJobNotCancelableErrorArgs({
    jobId: "job-1",
    status: "running",
    message: "cannot cancel",
  });
  assert.equal(notCancelable.code, "queue.job_not_cancelable");
  assert.equal(notCancelable.context.status, "running");
});

test("job-route-service: state payload and cursor helpers are deterministic", () => {
  const job = {
    id: "job-1",
    status: "done",
    events: [{ seq: 2 }],
    nextSeq: 3,
  };
  assert.equal(getQueueNextCursor(job), 2);
  assert.equal(getQueueNextCursor({ ...job, events: [], nextSeq: 9 }), 8);

  const payload = buildQueueJobStatePayload({
    job,
    events: [{ seq: 1 }],
    queueJobSnapshotFn: (value) => ({ id: value.id }),
    isQueueJobFinalStatusFn: (status) => status === "done",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.job.id, "job-1");
  assert.equal(payload.done, true);
  assert.equal(payload.nextCursor, 2);
});

test("job-route-service: stream event builders use API error envelope", () => {
  const buildApiErrorPayloadFn = (args) => ({
    ok: false,
    error: { code: args.code, userMessage: args.userMessage },
  });

  const missing = buildQueueMissingJobStreamEvents({
    jobId: "job-404",
    buildApiErrorPayloadFn,
  });
  assert.equal(missing.errorEvent.type, "error");
  assert.equal(missing.errorEvent.error.code, "queue.job_not_found");
  assert.equal(missing.endEvent.code, 404);

  const timeout = buildQueueStreamTimeoutEvents({
    jobId: "job-timeout",
    buildApiErrorPayloadFn,
  });
  assert.equal(timeout.errorEvent.error.code, "queue.stream_timeout");
  assert.equal(timeout.endEvent.code, 408);
});

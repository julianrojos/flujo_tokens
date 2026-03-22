import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { API_ERROR_CODES } from "@/lib/api-errors";
import {
  executeRunAllSequence,
  type RunAllState,
  type SetRunAllState,
} from "./use-run-all";

function createStateHarness(initial: RunAllState) {
  let current = initial;
  const snapshots: RunAllState[] = [];

  const setState: SetRunAllState = (next) => {
    current = typeof next === "function" ? next(current) : next;
    snapshots.push(current);
  };

  return {
    setState,
    getCurrent: () => current,
    snapshots,
  };
}

describe("executeRunAllSequence", () => {
  test("success path completes 4 steps and calls onDone once", async () => {
    const calls: Array<{ endpoint: string; init?: RequestInit }> = [];
    const onDoneCalls: string[] = [];
    const stateHarness = createStateHarness({
      isRunning: false,
      stepIndex: 0,
      failed: false,
    });

    await executeRunAllSequence({
      requestJsonFn: async (endpoint, init) => {
        calls.push({ endpoint, init });
        return {};
      },
      setState: stateHarness.setState,
      onDone: () => {
        onDoneCalls.push("done");
      },
      getHeaders: () => ({ "x-ds-system": "test-system" }),
      waitForQueuedJobFn: async () => true,
    });

    assert.equal(calls.length, 4);
    assert.deepEqual(
      calls.map((entry) => entry.endpoint),
      [
        "/api/refresh-registry",
        "/api/refresh-token-usage-index",
        "/api/refresh-token-health",
        "/api/refresh-token-graph",
      ],
    );
    assert.equal(onDoneCalls.length, 1);
    assert.deepEqual(stateHarness.getCurrent(), {
      isRunning: false,
      stepIndex: 0,
      failed: false,
      errorCode: undefined,
      errorMessage: undefined,
    });
  });

  test("queued job failure marks state as failed with queue error code", async () => {
    const stateHarness = createStateHarness({
      isRunning: false,
      stepIndex: 0,
      failed: false,
    });

    let requestCount = 0;
    let onDoneCalled = false;

    await executeRunAllSequence({
      requestJsonFn: async (endpoint) => {
        requestCount += 1;
        assert.equal(endpoint, "/api/refresh-registry");
        return {
          jobId: "job-1",
          statusUrl: "/api/jobs/job-1",
        };
      },
      setState: stateHarness.setState,
      onDone: () => {
        onDoneCalled = true;
      },
      getHeaders: () => undefined,
      waitForQueuedJobFn: async (statusUrl) => {
        assert.equal(statusUrl, "/api/jobs/job-1");
        return false;
      },
    });

    assert.equal(requestCount, 1);
    assert.equal(onDoneCalled, false);
    assert.deepEqual(stateHarness.getCurrent(), {
      isRunning: false,
      stepIndex: 1,
      failed: true,
      errorCode: API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED,
      errorMessage: "Queued operation finished with error or cancellation.",
    });
  });

  test("request error marks state as failed with request.failed code", async () => {
    const stateHarness = createStateHarness({
      isRunning: false,
      stepIndex: 0,
      failed: false,
    });

    let onDoneCalled = false;

    await executeRunAllSequence({
      requestJsonFn: async () => {
        throw new Error("network down");
      },
      setState: stateHarness.setState,
      onDone: () => {
        onDoneCalled = true;
      },
    });

    assert.equal(onDoneCalled, false);
    const finalState = stateHarness.getCurrent();
    assert.equal(finalState.isRunning, false);
    assert.equal(finalState.stepIndex, 1);
    assert.equal(finalState.failed, true);
    assert.equal(finalState.errorCode, "request.failed");
    assert.equal(finalState.errorMessage, "Operation failed.");
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ApiErrorDisplay } from "@/lib/api-error-ux";
import type { OperationHistoryEvent } from "@/lib/api";
import {
  refreshOperationHistoryWithDeps,
  replaySelectedOperationWithDeps,
} from "./use-operations-history";

function createHistoryEvent(id: string): OperationHistoryEvent {
  return {
    id,
    timestamp: "2026-03-22T12:00:00.000Z",
    eventType: "job.completed",
    operation: "ds:pipeline",
    system: "default",
    status: "success",
    durationMs: 123,
    requestId: "req-1",
    jobId: "job-1",
    sourceEventId: null,
    inputHash: "in-hash",
    outputHash: "out-hash",
    result: {
      ok: true,
      code: null,
      summary: "done",
    },
  };
}

function createDisplayError(message: string): ApiErrorDisplay {
  return {
    title: "Error",
    message,
    action: "Retry",
    code: null,
    requestId: null,
    retryable: true,
  };
}

describe("refreshOperationHistoryWithDeps", () => {
  test("refreshOperationHistory OK populates events and selects first event", async () => {
    const inFlightRef = { current: false };
    let historyLoading = false;
    let historyError: ApiErrorDisplay | null = createDisplayError("stale");
    let historyEvents: OperationHistoryEvent[] = [];
    let selectedHistoryEventId: string | null = null;

    await refreshOperationHistoryWithDeps({
      inFlightRef,
      fetchHistory: async () => ({
        ok: true,
        events: [createHistoryEvent("event-1")],
        filters: {
          systemId: null,
          operation: null,
          status: null,
          from: null,
          to: null,
          limit: 12,
        },
        summary: {
          returned: 1,
          scannedRows: 1,
          scannedFiles: 1,
        },
      }),
      setHistoryLoading: (next) => {
        historyLoading = next;
      },
      setHistoryError: (next) => {
        historyError = next;
      },
      setHistoryEvents: (next) => {
        historyEvents = next;
      },
      setSelectedHistoryEventId: (updater) => {
        selectedHistoryEventId = updater(selectedHistoryEventId);
      },
    });

    assert.equal(historyLoading, false);
    assert.equal(historyError, null);
    assert.equal(historyEvents.length, 1);
    assert.equal(historyEvents[0].id, "event-1");
    assert.equal(selectedHistoryEventId, "event-1");
    assert.equal(inFlightRef.current, false);
  });

  test("refreshOperationHistory error sets display error and clears events", async () => {
    const inFlightRef = { current: false };
    let historyLoading = false;
    let historyError: ApiErrorDisplay | null = null;
    let historyEvents: OperationHistoryEvent[] = [createHistoryEvent("event-old")];
    let selectedHistoryEventId: string | null = "event-old";

    await refreshOperationHistoryWithDeps({
      inFlightRef,
      fetchHistory: async () => {
        throw new Error("history unavailable");
      },
      setHistoryLoading: (next) => {
        historyLoading = next;
      },
      setHistoryError: (next) => {
        historyError = next;
      },
      setHistoryEvents: (next) => {
        historyEvents = next;
      },
      setSelectedHistoryEventId: (updater) => {
        selectedHistoryEventId = updater(selectedHistoryEventId);
      },
      toApiErrorDisplayFn: (error) =>
        createDisplayError(
          error instanceof Error ? error.message : "unknown",
        ),
    });

    assert.equal(historyLoading, false);
    assert.ok(historyError);
    assert.equal(historyError?.message, "history unavailable");
    assert.deepEqual(historyEvents, []);
    assert.equal(selectedHistoryEventId, null);
    assert.equal(inFlightRef.current, false);
  });
});

describe("replaySelectedOperationWithDeps", () => {
  test("replaySelectedOperation triggers refresh and sets replay notice", async () => {
    const selectedHistoryEvent = createHistoryEvent("event-2");

    let replayInFlightEventId: string | null = null;
    let replayNotice: string | null = "old-notice";
    let replayError: ApiErrorDisplay | null = createDisplayError("old-error");
    let refreshHistoryCalls = 0;
    let refreshRegressionsCalls = 0;

    await replaySelectedOperationWithDeps({
      selectedHistoryEvent,
      replayInFlightEventId: null,
      replayOperationEventFn: async () => ({
        ok: true,
        accepted: true,
        jobId: "job-123",
        requestId: "req-1",
        status: "queued",
        statusUrl: "/api/jobs/job-123",
        streamUrl: "/api/jobs/job-123/stream",
      }),
      setReplayInFlightEventId: (next) => {
        replayInFlightEventId = next;
      },
      setReplayNotice: (next) => {
        replayNotice = next;
      },
      setReplayError: (next) => {
        replayError = next;
      },
      refreshOperationHistory: async () => {
        refreshHistoryCalls += 1;
      },
      refreshOperationRegressions: async () => {
        refreshRegressionsCalls += 1;
      },
    });

    assert.equal(replayInFlightEventId, null);
    assert.equal(replayNotice, "Replay queued as job-123.");
    assert.equal(replayError, null);
    assert.equal(refreshHistoryCalls, 1);
    assert.equal(refreshRegressionsCalls, 1);
  });
});

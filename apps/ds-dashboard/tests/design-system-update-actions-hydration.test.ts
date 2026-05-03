import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  extractQueueJobState,
  loadPersistedSyncState,
} from "../src/features/system/design-system-update-actions";
import type { SyncStepKey } from "../src/features/system/design-system-sync-logic";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("design-system update hydration", () => {
  it("hydrates legacy sync snapshots without tokens as completed instead of idle", () => {
    (globalThis as { window: unknown }).window = {
      localStorage: {
        getItem: () =>
          JSON.stringify({
            systemId: "sys-01",
            jobId: "job-legacy",
            updatedAt: "2026-05-03T10:00:00.000Z",
            steps: {
              components: {
                jobId: "job-legacy",
                status: "completed",
                summary: null,
              },
              variables: {
                jobId: "job-legacy",
                status: "completed",
                summary: null,
              },
            },
          }),
      },
    };

    const persisted = loadPersistedSyncState("sys-01");
    assert.ok(persisted);
    assert.equal(persisted?.steps.tokens.status, "completed");
  });

  it("rehydrates an in-flight tokens job without overwriting completed steps", () => {
    const fallbackSteps = {
      components: {
        jobId: "job-1",
        status: "completed",
        summary: null,
        progress: null,
      },
      variables: {
        jobId: "job-1",
        status: "completed",
        summary: null,
        progress: null,
      },
      tokens: {
        jobId: "job-1",
        status: "completed",
        summary: null,
        progress: null,
      },
    } as Record<SyncStepKey, { jobId?: string; status: "idle" | "queued" | "running" | "completed" | "completed_with_warnings" | "failed"; summary: null; progress: null }>;

    const hydrated = extractQueueJobState(
      {
        job: {
          id: "job-2",
          operation: "sync:design-system:tokens",
          status: "running",
          result: null,
        },
      } as never,
      fallbackSteps,
    );

    assert.ok(hydrated);
    assert.equal(hydrated?.steps.components.status, "completed");
    assert.equal(hydrated?.steps.variables.status, "completed");
    assert.equal(hydrated?.steps.tokens.status, "running");
    assert.equal(hydrated?.steps.tokens.jobId, "job-2");
  });
});

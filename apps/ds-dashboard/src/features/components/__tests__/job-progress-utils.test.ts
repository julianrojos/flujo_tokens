import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeProgressFromEvents,
  eventToProgress,
  getProgressLabel,
  isProgressActive,
  isTerminalEvent,
} from "../../../lib/job-progress";
import {
  nextSlowFillPercent,
  resolveSlowFillConfig,
  shouldResetAfterRetry,
} from "../../../hooks/use-job-progress";

describe("job-progress utils", () => {
  it("maps known and unknown events to progress", () => {
    assert.equal(eventToProgress("llm.calling"), 25);
    assert.equal(eventToProgress("unknown.event"), 2);
  });

  it("resolves labels with stage fallback", () => {
    assert.equal(getProgressLabel("llm.calling"), "Generating documentation…");
    assert.equal(getProgressLabel("unknown.event", "patching"), "Applying editorial patch…");
    assert.equal(getProgressLabel("unknown.event"), "Processing…");
  });

  it("detects terminal events", () => {
    assert.equal(isTerminalEvent("job.completed"), true);
    assert.equal(isTerminalEvent("job.failed"), true);
    assert.equal(isTerminalEvent("llm.calling"), false);
  });

  it("computes progress from last event in sequence", () => {
    const result = computeProgressFromEvents([
      { event: "pipeline.started" },
      { event: "llm.calling" },
      { event: "schema.validated" },
    ]);
    assert.equal(result.percent, 65);
    assert.equal(result.label, "Schema validated");
  });

  it("handles empty event list with preparing fallback", () => {
    const result = computeProgressFromEvents([]);
    assert.equal(result.percent, 2);
    assert.equal(result.label, "Preparing…");
  });

  it("identifies active statuses", () => {
    assert.equal(isProgressActive("running"), true);
    assert.equal(isProgressActive("queued"), true);
    assert.equal(isProgressActive("completed"), false);
  });
});

describe("use-job-progress pure helpers", () => {
  it("resolves slow-fill config only for known triggers", () => {
    assert.deepEqual(resolveSlowFillConfig("llm.calling"), { trigger: "llm.calling", cap: 58 });
    assert.equal(resolveSlowFillConfig("unknown"), null);
    assert.equal(resolveSlowFillConfig(null), null);
  });

  it("increments slow-fill and stops at cap", () => {
    assert.deepEqual(nextSlowFillPercent(57, 58), { value: 58, shouldStop: true });
    assert.deepEqual(nextSlowFillPercent(30, 58), { value: 31, shouldStop: false });
    assert.deepEqual(nextSlowFillPercent(58, 58), { value: 58, shouldStop: true });
  });

  it("resets after retry only when previous run finished", () => {
    assert.equal(shouldResetAfterRetry(100, 25), true);
    assert.equal(shouldResetAfterRetry(99, 25), false);
    assert.equal(shouldResetAfterRetry(100, 100), false);
  });
});

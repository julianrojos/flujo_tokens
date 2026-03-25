/**
 * Unit tests for adoption metrics utilities
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAdoptionRateSafe,
  isPartialLocalUsage,
  buildAggregateAdoptionState,
  buildDimensionAdoptionState,
  formatAdoptionPercentage,
} from "./adoption-metrics.js";
import type { FileReport } from "@/types/consumers";

describe("adoption-metrics", () => {
  describe("computeAdoptionRateSafe", () => {
    it("returns null when localUsed is null", () => {
      assert.strictEqual(computeAdoptionRateSafe(5, null), null);
    });

    it("returns null when localUsed is undefined", () => {
      assert.strictEqual(computeAdoptionRateSafe(5, undefined), null);
    });

    it("returns null when total is 0 (0/0 indeterminate)", () => {
      assert.strictEqual(computeAdoptionRateSafe(0, 0), null);
    });

    it("returns 0.0 when DS=0 and local>0 (0% adoption)", () => {
      assert.strictEqual(computeAdoptionRateSafe(0, 5), 0);
    });

    it("returns 1.0 when DS>0 and local=0 (100% adoption)", () => {
      assert.strictEqual(computeAdoptionRateSafe(5, 0), 1);
    });

    it("returns correct ratio for mixed values", () => {
      assert.strictEqual(computeAdoptionRateSafe(3, 1), 0.75);
    });
  });

  describe("isPartialLocalUsage", () => {
    it("returns false when both are null", () => {
      assert.strictEqual(isPartialLocalUsage(null, null), false);
    });

    it("returns false when both are available", () => {
      assert.strictEqual(isPartialLocalUsage(3, 5), false);
    });

    it("returns true when only component is available", () => {
      assert.strictEqual(isPartialLocalUsage(3, null), true);
    });

    it("returns true when only variable is available", () => {
      assert.strictEqual(isPartialLocalUsage(null, 5), true);
    });

    it("returns false when both are 0 (available, not partial)", () => {
      assert.strictEqual(isPartialLocalUsage(0, 0), false);
    });
  });

  describe("buildAggregateAdoptionState", () => {
    const createReport = (overrides: Partial<FileReport>): FileReport => ({
      consumerId: "test",
      consumerName: "Test",
      consumerFileKey: "test-key",
      lastSyncedAt: "2024-01-01T00:00:00Z",
      status: "ok",
      componentCount: 0,
      variableCount: 0,
      warningCount: 0,
      topComponents: [],
      topVariables: [],
      impactLevel: { level: "LOW", description: "Low" },
      ...overrides,
    });

    it("returns unavailable state when all local counts are null", () => {
      const report = createReport({
        componentCount: 5,
        variableCount: 10,
        localComponentUsedCount: null,
        localVariableUsedCount: null,
        adoptionRate: null,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.showUnavailable, true);
      assert.strictEqual(state.showNA, false);
      assert.strictEqual(state.showBar, false);
      assert.strictEqual(state.showPartial, false);
    });

    it("returns partial state when one local count is null", () => {
      const report = createReport({
        componentCount: 5,
        variableCount: 10,
        localComponentUsedCount: 3,
        localVariableUsedCount: null,
        adoptionRate: null,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.showUnavailable, true);
      assert.strictEqual(state.showNA, false);
      assert.strictEqual(state.showBar, false);
      assert.strictEqual(state.showPartial, true);
    });

    it("returns N/A state when all counts are 0", () => {
      const report = createReport({
        componentCount: 0,
        variableCount: 0,
        localComponentUsedCount: 0,
        localVariableUsedCount: 0,
        adoptionRate: null,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.showNA, true);
      assert.strictEqual(state.showUnavailable, false);
      assert.strictEqual(state.showBar, false);
    });

    it("returns bar state when adoptionRate is available", () => {
      const report = createReport({
        componentCount: 5,
        variableCount: 10,
        localComponentUsedCount: 3,
        localVariableUsedCount: 2,
        adoptionRate: 0.6,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.showBar, true);
      assert.strictEqual(state.percentage, 60);
      assert.strictEqual(state.percentageLabel, "60%");
      assert.strictEqual(state.showPartial, false);
    });

    it("returns bar state when adoptionRate is available but local counts are unavailable", () => {
      const report = createReport({
        componentCount: 5,
        variableCount: 10,
        localComponentUsedCount: null,
        localVariableUsedCount: null,
        adoptionRate: 0.6,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.showBar, true);
      assert.strictEqual(state.totalLocalUsed, null);
      assert.strictEqual(state.showPartial, false);
      assert.strictEqual(state.percentageLabel, "60%");
    });

    it("computes totalDsUsed correctly", () => {
      const report = createReport({
        componentCount: 7,
        variableCount: 3,
        localComponentUsedCount: 2,
        localVariableUsedCount: 1,
        adoptionRate: 0.8,
      });
      const state = buildAggregateAdoptionState(report);
      assert.strictEqual(state.totalDsUsed, 10);
      assert.strictEqual(state.totalLocalUsed, 3);
    });
  });

  describe("buildDimensionAdoptionState", () => {
    it("returns unavailable when localUsed is null", () => {
      const state = buildDimensionAdoptionState(5, null);
      assert.strictEqual(state.showUnavailable, true);
      assert.strictEqual(state.showBar, false);
      assert.strictEqual(state.percentage, null);
    });

    it("returns N/A when total is 0", () => {
      const state = buildDimensionAdoptionState(0, 0);
      assert.strictEqual(state.showNA, true);
      assert.strictEqual(state.showBar, false);
    });

    it("returns bar state when data is available", () => {
      const state = buildDimensionAdoptionState(8, 2);
      assert.strictEqual(state.showBar, true);
      assert.strictEqual(state.percentage, 80);
      assert.strictEqual(state.percentageLabel, "80%");
      assert.strictEqual(state.showPartial, false);
    });

    it("handles DS=0 with local>0 (0% adoption)", () => {
      const state = buildDimensionAdoptionState(0, 5);
      assert.strictEqual(state.showBar, true);
      assert.strictEqual(state.percentage, 0);
      assert.strictEqual(state.percentageLabel, "0%");
    });
  });

  describe("formatAdoptionPercentage", () => {
    it("returns empty string for null", () => {
      assert.strictEqual(formatAdoptionPercentage(null), "");
    });

    it("rounds to nearest integer", () => {
      assert.strictEqual(formatAdoptionPercentage(0.754), "75%");
      assert.strictEqual(formatAdoptionPercentage(0.756), "76%");
    });

    it("handles 0 and 1 correctly", () => {
      assert.strictEqual(formatAdoptionPercentage(0), "0%");
      assert.strictEqual(formatAdoptionPercentage(1), "100%");
    });
  });
});

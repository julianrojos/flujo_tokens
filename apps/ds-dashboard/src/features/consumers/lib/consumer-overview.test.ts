import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConsumerComponentRankingRows,
  buildConsumerOverviewRows,
  buildConsumerOverviewSummary,
  buildConsumerVariableRankingRows,
} from "./consumer-overview";
import type { ComponentUsageReport, DsConsumer, DsSyncRun, VariableUsageReport } from "@/types/consumers";

function makeConsumer(
  id: string,
  name: string,
  componentCount: number,
  variableCount: number,
  localComponentUsedCount: number | null = 0,
  localVariableUsedCount: number | null = 0,
) {
  return {
    id,
    dsFileKey: "ds-1",
    consumerFileKey: `file-${id}`,
    consumerName: name,
    createdAt: "2026-05-25T00:00:00.000Z",
    latestSync: {
      id: `sync-${id}`,
      consumerId: id,
      syncedAt: "2026-05-25T10:00:00.000Z",
      durationMs: 120,
      status: "ok" as const,
      componentCount,
      variableCount,
      warningCount: 0,
      localComponentUsedCount,
      localVariableUsedCount,
      parentDerivedComponentCount: 0,
    },
  } satisfies DsConsumer & { latestSync?: DsSyncRun };
}

describe("consumer-overview helpers", () => {
  it("builds aggregated consumer summary and rows", () => {
    const consumers = [
      makeConsumer("1", "Bravo", 10, 8, 3, 2),
      makeConsumer("2", "Alpha", 6, 5, 1, 0),
    ];

    const summary = buildConsumerOverviewSummary(consumers);
    assert.equal(summary.activeConsumers, 2);
    assert.equal(summary.totalComponentUsage, 12);
    assert.equal(summary.totalVariableUsage, 11);

    const rows = buildConsumerOverviewRows(consumers);
    assert.deepEqual(rows.map((row) => row.consumerName), ["Bravo", "Alpha"]);
    assert.equal(rows[0].componentUsage.used, 7);
    assert.equal(rows[0].componentUsage.total, 10);
    assert.equal(rows[0].componentUsage.adoptionPercent, 70);
  });

  it("sorts component ranking rows by total instances", () => {
    const reports: ComponentUsageReport[] = [
      {
        componentKey: "a",
        componentName: "Alpha",
        totalInstances: 4,
        consumers: [{ consumerId: "1", consumerName: "A", consumerFileKey: "f", lastSyncedAt: "2026-05-25T10:00:00.000Z", sampleNodeIds: [], sampleLinks: [] }],
        impactLevel: { level: "LOW", description: "low" },
        sampleLinks: [],
      },
      {
        componentKey: "b",
        componentName: "Beta",
        totalInstances: 9,
        consumers: [{ consumerId: "2", consumerName: "B", consumerFileKey: "f", lastSyncedAt: "2026-05-25T10:00:00.000Z", sampleNodeIds: [], sampleLinks: [] }],
        impactLevel: { level: "HIGH", description: "high" },
        sampleLinks: [],
      },
    ];

    const rows = buildConsumerComponentRankingRows(reports, 4);
    assert.deepEqual(rows.map((row) => row.componentName), ["Beta", "Alpha"]);
    assert.equal(rows[0].impactLevel.level, "HIGH");
    assert.equal(rows[0].coveragePercent, 25);
  });

  it("sorts variable ranking rows by total nodes", () => {
    const reports: VariableUsageReport[] = [
      {
        variableKey: "a",
        variableName: "Alpha",
        variableType: "color",
        totalNodes: 2,
        consumers: [{ consumerId: "1", consumerName: "A", consumerFileKey: "f", nodeCount: 1, sampleNodeIds: [], sampleLinks: [], lastSyncedAt: "2026-05-25T10:00:00.000Z" }],
        impactLevel: { level: "LOW", description: "low" },
        sampleLinks: [],
      },
      {
        variableKey: "b",
        variableName: "Beta",
        variableType: "color",
        totalNodes: 7,
        consumers: [{ consumerId: "2", consumerName: "B", consumerFileKey: "f", nodeCount: 1, sampleNodeIds: [], sampleLinks: [], lastSyncedAt: "2026-05-25T10:00:00.000Z" }],
        impactLevel: { level: "MEDIUM", description: "medium" },
        sampleLinks: [],
      },
    ];

    const rows = buildConsumerVariableRankingRows(reports, 4);
    assert.deepEqual(rows.map((row) => row.variableName), ["Beta", "Alpha"]);
    assert.equal(rows[0].impactLevel.level, "MEDIUM");
    assert.equal(rows[0].coveragePercent, 25);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConsumerTopComponentRankingRows } from "./consumer-top-component-ranking.js";
import type { ComponentUsageReport } from "@/types/consumers";

function makeReport(
  componentKey: string,
  componentName: string,
  totalInstances: number,
  impactLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW",
  consumers: Array<string> = ["c-1"],
): ComponentUsageReport {
  return {
    componentKey,
    componentName,
    totalInstances,
    consumers: consumers.map((consumerId) => ({
      consumerId,
      consumerName: consumerId,
      consumerFileKey: `file-${consumerId}`,
      lastSyncedAt: "2026-05-25T10:00:00.000Z",
      sampleNodeIds: [],
      sampleLinks: [],
    })),
    impactLevel: {
      level: impactLevel,
      description: impactLevel.toLowerCase(),
    },
    sampleLinks: [],
  };
}

describe("consumer-top-component-ranking", () => {
  it("keeps catalogued components with different slugs as separate rows", () => {
    const reports = [
      makeReport("alert-ds", "alert-ds", 20, "LOW", ["c-1", "c-2"]),
      makeReport("alert-legacy", "alert-legacy", 3, "HIGH", ["c-2", "c-3"]),
    ];
    const catalog = [
      { slug: "alert-ds", display_name: "Alert", figma: { variants: [] } },
      { slug: "alert-legacy", display_name: "Alert", figma: { variants: [] } },
    ];

    const rows = buildConsumerTopComponentRankingRows(reports, 4, catalog);

    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.resolvedSlug).sort(),
      ["alert-ds", "alert-legacy"],
    );
    assert.deepEqual(
      rows.map((row) => row.componentName),
      ["Alert", "Alert"],
    );
  });

  it("does not merge uncatalogued rows into catalogued rows with the same visible label", () => {
    const reports = [
      makeReport("alert-ds", "alert-ds", 10, "LOW", ["c-1"]),
      makeReport("alert", "Alert", 3, "LOW", ["c-2"]),
    ];
    const catalog = [
      { slug: "alert-ds", display_name: "Alert", figma: { variants: [] } },
      { slug: "alert-legacy", display_name: "Alert", figma: { variants: [] } },
    ];

    const rows = buildConsumerTopComponentRankingRows(reports, 4, catalog);

    assert.equal(rows.length, 2);
    const catalogued = rows.find((row) => row.resolvedSlug === "alert-ds");
    const uncatalogued = rows.find((row) => row.isUncatalogued);
    assert.ok(catalogued);
    assert.ok(uncatalogued);
    assert.equal(catalogued?.totalInstances, 10);
    assert.equal(uncatalogued?.componentName, "Alert");
  });

  it("keeps catalogued rows with ambiguous slugs separate from uncatalogued rows with the same visible label", () => {
    const catalog = [
      {
        slug: "alert-ds",
        display_name: "Alert",
        figma: { variants: [{ name: "State=Default" }] },
      },
      {
        slug: "alert-legacy",
        display_name: "Alert",
        figma: { variants: [{ name: "State=Hover" }] },
      },
    ];
    const reports = [
      makeReport("ds", "State=Default", 10, "LOW", ["c-1"]),
      makeReport("ext", "Alert", 3, "LOW", ["c-2"]),
    ];

    const rows = buildConsumerTopComponentRankingRows(reports, 4, catalog);

    assert.equal(rows.length, 2);
    const keys = rows.map((row) => row.componentKey);
    assert.equal(new Set(keys).size, keys.length);
    const catalogued = rows.find((row) => !row.isUncatalogued);
    const uncatalogued = rows.find((row) => row.isUncatalogued);
    assert.ok(catalogued);
    assert.ok(uncatalogued);
    assert.equal(catalogued?.totalInstances, 10);
    assert.equal(uncatalogued?.totalInstances, 3);
  });

  it("skips bare variant assignments without a catalog match", () => {
    const reports = [makeReport("variant-1", "Type=Default", 8)];

    const rows = buildConsumerTopComponentRankingRows(reports, 4, []);

    assert.deepEqual(rows, []);
  });
});

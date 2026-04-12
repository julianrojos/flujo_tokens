import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateComponentAdoption,
  loadComponentAdoptionReports,
} from "./use-component-adoption";
import type { ComponentUsageReport } from "@/types/consumers";
import type { ComponentRegistryItem } from "@/types/component-registry";

const BASE_ITEMS: ComponentRegistryItem[] = [
  {
    slug: "boton",
    display_name: "Botón",
    paths: { spec: "" },
    spec: { exists: false },
    figma: { file_url: null, component_set_node_id: null },
    fingerprint_sha256: "",
  },
];

function buildReport(args: {
  componentKey: string;
  componentName: string;
  totalInstances: number;
  impact: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  consumers?: ComponentUsageReport["consumers"];
}): ComponentUsageReport {
  return {
    componentKey: args.componentKey,
    componentName: args.componentName,
    totalInstances: args.totalInstances,
    consumers: args.consumers ?? [],
    impactLevel: { level: args.impact, description: args.impact },
    sampleLinks: [],
  };
}

describe("loadComponentAdoptionReports", () => {
  it("returns empty when slug is undefined", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: undefined,
      dsFileKey: "ds-key",
      allItems: BASE_ITEMS,
    });
    assert.deepEqual(reports, []);
  });

  it("returns empty when dsFileKey is null", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: null,
      allItems: BASE_ITEMS,
    });
    assert.deepEqual(reports, []);
  });

  it("returns empty when dsFileKey is undefined", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: undefined,
      allItems: BASE_ITEMS,
    });
    assert.deepEqual(reports, []);
  });

  it("returns empty when dsFileKey is empty string", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: "",
      allItems: BASE_ITEMS,
    });
    assert.deepEqual(reports, []);
  });

  it("matches slug with diacritics and slash naming", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: "ds-key",
      allItems: BASE_ITEMS,
      fetcher: async () => ({
        ok: true,
        data: [
          buildReport({
            componentKey: "k1",
            componentName: "botón/Variant=Accent",
            totalInstances: 5,
            impact: "LOW",
          }),
          buildReport({
            componentKey: "k2",
            componentName: "Card/Size=M",
            totalInstances: 3,
            impact: "LOW",
          }),
        ],
      }),
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].componentName, "botón/Variant=Accent");
  });

  it("matches comma-convention component names", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: "ds-key",
      allItems: BASE_ITEMS,
      fetcher: async () => ({
        ok: true,
        data: [
          buildReport({
            componentKey: "k1",
            componentName: "Botón, Variant=Default",
            totalInstances: 2,
            impact: "LOW",
          }),
        ],
      }),
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].componentName, "Botón, Variant=Default");
  });

  it("bubbles fetch errors to caller", async () => {
    await assert.rejects(async () => {
      await loadComponentAdoptionReports({
        slug: "boton",
        dsFileKey: "ds-key",
        allItems: BASE_ITEMS,
        fetcher: async () => {
          throw new Error("network failed");
        },
      });
    }, /network failed/);
  });

  it("handles API response with ok: false gracefully", async () => {
    await assert.rejects(async () => {
      await loadComponentAdoptionReports({
        slug: "boton",
        dsFileKey: "ds-key",
        allItems: BASE_ITEMS,
        fetcher: async () => {
          throw new Error("API error");
        },
      });
    }, /API error/);
  });

  it("returns empty array when fetch returns no matching reports", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "nonexistent",
      dsFileKey: "ds-key",
      allItems: BASE_ITEMS,
      fetcher: async () => ({
        ok: true,
        data: [
          buildReport({
            componentKey: "k1",
            componentName: "Button/Size=L",
            totalInstances: 5,
            impact: "LOW",
          }),
        ],
      }),
    });
    assert.deepEqual(reports, []);
  });

  it("returns empty when API payload data is not an array", async () => {
    const reports = await loadComponentAdoptionReports({
      slug: "boton",
      dsFileKey: "ds-key",
      allItems: BASE_ITEMS,
      fetcher: async () => ({
        ok: true,
        data: null,
      }) as unknown as { ok: true; data: ComponentUsageReport[] },
    });
    assert.deepEqual(reports, []);
  });
});

describe("aggregateComponentAdoption", () => {
  it("aggregates total instances and consumer rows", () => {
    const reports: ComponentUsageReport[] = [
      buildReport({
        componentKey: "k1",
        componentName: "Button/Variant=A",
        totalInstances: 5,
        impact: "HIGH",
        consumers: [
          {
            consumerId: "c1",
            consumerName: "Consumer One",
            consumerFileKey: "file-1",
            instanceCount: 3,
            sampleNodeIds: [],
            lastSyncedAt: "2026-01-01T10:00:00Z",
            sampleLinks: [],
          },
        ],
      }),
      buildReport({
        componentKey: "k2",
        componentName: "Button/Variant=B",
        totalInstances: 7,
        impact: "CRITICAL",
        consumers: [
          {
            consumerId: "c1",
            consumerName: "Consumer One",
            consumerFileKey: "file-1",
            instanceCount: 4,
            sampleNodeIds: [],
            lastSyncedAt: "2026-01-01T10:00:00Z",
            sampleLinks: [],
          },
          {
            consumerId: "c2",
            consumerName: "Consumer Two",
            consumerFileKey: "file-2",
            instanceCount: undefined,
            sampleNodeIds: [],
            lastSyncedAt: "2026-01-02T10:00:00Z",
            sampleLinks: [],
          },
        ],
      }),
    ];

    const result = aggregateComponentAdoption(reports);
    assert.equal(result.totalInstances, 12);
    assert.equal(result.consumerCount, 2);
    assert.equal(result.worstImpactLevel, "CRITICAL");
    assert.equal(result.aggregatedConsumers[0].id, "c1");
    assert.equal(result.aggregatedConsumers[0].instances, 7);
  });

  it("returns empty aggregate for empty reports", () => {
    const result = aggregateComponentAdoption([]);
    assert.equal(result.totalInstances, 0);
    assert.equal(result.consumerCount, 0);
    assert.equal(result.worstImpactLevel, null);
    assert.deepEqual(result.aggregatedConsumers, []);
  });

  it("handles missing instanceCount with ?? 0 fallback", () => {
    const reports: ComponentUsageReport[] = [
      buildReport({
        componentKey: "k1",
        componentName: "Button/A",
        totalInstances: 5,
        impact: "MEDIUM",
        consumers: [
          {
            consumerId: "c1",
            consumerName: "C1",
            consumerFileKey: "f1",
            instanceCount: undefined,
            sampleNodeIds: [],
            lastSyncedAt: "",
            sampleLinks: [],
          },
        ],
      }),
    ];

    const result = aggregateComponentAdoption(reports);
    assert.equal(result.aggregatedConsumers[0].instances, 0);
  });

  it("handles empty lastSyncedAt in consumers", () => {
    const reports: ComponentUsageReport[] = [
      buildReport({
        componentKey: "k1",
        componentName: "Button/A",
        totalInstances: 5,
        impact: "MEDIUM",
        consumers: [
          {
            consumerId: "c1",
            consumerName: "C1",
            consumerFileKey: "f1",
            instanceCount: 3,
            sampleNodeIds: [],
            lastSyncedAt: "",
            sampleLinks: [],
          },
        ],
      }),
    ];

    const result = aggregateComponentAdoption(reports);
    assert.equal(result.aggregatedConsumers[0].lastSyncedAt, null);
  });

  it("picks worst impact level across multiple reports", () => {
    const reports: ComponentUsageReport[] = [
      buildReport({ componentKey: "k1", componentName: "Button/A", totalInstances: 1, impact: "LOW" }),
      buildReport({ componentKey: "k2", componentName: "Button/B", totalInstances: 1, impact: "MEDIUM" }),
      buildReport({ componentKey: "k3", componentName: "Button/C", totalInstances: 1, impact: "HIGH" }),
    ];

    const result = aggregateComponentAdoption(reports);
    assert.equal(result.worstImpactLevel, "HIGH");
  });

  it("sorts aggregated consumers by instances descending", () => {
    const reports: ComponentUsageReport[] = [
      buildReport({
        componentKey: "k1",
        componentName: "Button/A",
        totalInstances: 10,
        impact: "LOW",
        consumers: [
          { consumerId: "c1", consumerName: "C1", consumerFileKey: "f1", instanceCount: 3, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
          { consumerId: "c2", consumerName: "C2", consumerFileKey: "f2", instanceCount: 10, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
          { consumerId: "c3", consumerName: "C3", consumerFileKey: "f3", instanceCount: 5, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
        ],
      }),
    ];

    const result = aggregateComponentAdoption(reports);
    assert.equal(result.aggregatedConsumers[0].id, "c2");
    assert.equal(result.aggregatedConsumers[1].id, "c3");
    assert.equal(result.aggregatedConsumers[2].id, "c1");
  });
});

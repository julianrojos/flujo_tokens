import assert from "node:assert/strict";
import test from "node:test";

import type { ComponentUsageReport } from "@/types/consumers";
import { deriveComponentSetVariants } from "./component-set-variants";

function report(partial: Partial<ComponentUsageReport>): ComponentUsageReport {
  return {
    componentKey: partial.componentKey ?? "k",
    componentName: partial.componentName ?? "Button/Variant=Default",
    totalInstances: partial.totalInstances ?? 0,
    consumers: partial.consumers ?? [],
    impactLevel: partial.impactLevel ?? { level: "LOW", description: "low" },
    sampleLinks: partial.sampleLinks ?? [],
  };
}

test("deriveComponentSetVariants filters by parent component-set name", () => {
  const reports = [
    report({ componentKey: "a", componentName: "Button/Variant=Default", totalInstances: 2 }),
    report({ componentKey: "b", componentName: "Button/Variant=Accent", totalInstances: 1 }),
    report({ componentKey: "c", componentName: "Card/Variant=Default", totalInstances: 9 }),
  ];

  const result = deriveComponentSetVariants(reports, "Button");

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((row) => row.componentKey), ["a", "b"]);
});

test("deriveComponentSetVariants is case-insensitive and trims input", () => {
  const reports = [
    report({ componentKey: "a", componentName: "botón/Variant=Default", totalInstances: 2 }),
  ];

  const result = deriveComponentSetVariants(reports, "  BOTÓN ");
  assert.equal(result.length, 1);
});

test("deriveComponentSetVariants supports comma-based variant naming for parent matching", () => {
  const reports = [
    report({
      componentKey: "comma-1",
      componentName: "Button, Size=Large, State=Hover",
      totalInstances: 1,
    }),
  ];

  const result = deriveComponentSetVariants(reports, "Button");
  assert.equal(result.length, 1);
  assert.equal(result[0].variantLabel, "Size=Large, State=Hover");
});

test("deriveComponentSetVariants computes variantLabel and sorts by impact then instances", () => {
  const reports = [
    report({
      componentKey: "low-more",
      componentName: "Button/Variant=Accent",
      totalInstances: 5,
      impactLevel: { level: "LOW", description: "low" },
      consumers: [{ consumerId: "1", consumerName: "c1", consumerFileKey: "f1", instanceCount: 1, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] }],
    }),
    report({
      componentKey: "high-less",
      componentName: "Button/Variant=Default",
      totalInstances: 3,
      impactLevel: { level: "HIGH", description: "high" },
      consumers: [
        { consumerId: "1", consumerName: "c1", consumerFileKey: "f1", instanceCount: 3, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
      ],
    }),
    report({
      componentKey: "high-more",
      componentName: "Button/Variant=Outline",
      totalInstances: 7,
      impactLevel: { level: "HIGH", description: "high" },
      consumers: [
        { consumerId: "1", consumerName: "c1", consumerFileKey: "f1", instanceCount: 3, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
        { consumerId: "2", consumerName: "c2", consumerFileKey: "f2", instanceCount: 4, sampleNodeIds: [], lastSyncedAt: "", sampleLinks: [] },
      ],
    }),
    report({
      componentKey: "low-less",
      componentName: "Button/Variant=Ghost",
      totalInstances: 2,
      impactLevel: { level: "LOW", description: "low" },
      consumers: [],
    }),
  ];

  const result = deriveComponentSetVariants(reports, "Button");

  // Should sort by impact first (HIGH before LOW), then by instances desc
  assert.deepEqual(result.map((row) => row.componentKey), ["high-more", "high-less", "low-more", "low-less"]);
  assert.equal(result[0].variantLabel, "Variant=Outline");
  assert.equal(result[0].consumerCount, 2);
  assert.equal(result[1].variantLabel, "Variant=Default");
  assert.equal(result[2].variantLabel, "Variant=Accent");
  assert.equal(result[3].variantLabel, "Variant=Ghost");
});

test("deriveComponentSetVariants is deterministic when impact and instances tie", () => {
  const reports = [
    report({
      componentKey: "b-key",
      componentName: "Button/Variant=Beta",
      totalInstances: 2,
      impactLevel: { level: "MEDIUM", description: "med" },
    }),
    report({
      componentKey: "a-key",
      componentName: "Button/Variant=Alpha",
      totalInstances: 2,
      impactLevel: { level: "MEDIUM", description: "med" },
    }),
  ];

  const result = deriveComponentSetVariants(reports, "Button");
  assert.deepEqual(result.map((row) => row.componentKey), ["a-key", "b-key"]);
});

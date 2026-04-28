import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildComponentLocalDependencySummary } from "./usage-details-summary";
import type { ConsumerWithUsageDetails } from "./usage-details-summary";

function makeConsumer(
  id: string,
  parentComponentKey: string,
  parentComponentName: string,
  childComponentKey: string,
  childComponentName: string,
  usageCount: number,
): ConsumerWithUsageDetails {
  return {
    id,
    dsFileKey: "rYOptx0KbO77Z6EJYadlvN",
    consumerFileKey: id,
    consumerName: id,
    createdAt: "2026-04-28T00:00:00.000Z",
    latestSync: {
      id: `sync-${id}`,
      consumerId: id,
      syncedAt: "2026-04-28T00:00:00.000Z",
      durationMs: 100,
      status: "ok",
      componentCount: 1,
      variableCount: 0,
      warningCount: 0,
      localComponentUsedCount: 1,
      parentDerivedComponentCount: 0,
      localVariableDefinedCount: 0,
      localVariableUsedCount: 0,
      usageDetails: {
        parentComponentUsages: [],
        localComponentGraph: [
          {
            parentComponentKey,
            parentComponentName,
            childComponentKey,
            childComponentName,
            usageCount,
            sampleNodeIds: ["42:7"],
          },
        ],
        componentPropertyUsages: [],
        tokenBindingDetails: [],
        usageShape: {
          components: { page: 0, localComponent: 1, nestedLocalComponent: 0 },
          tokens: { page: 0, localComponent: 0, nestedLocalComponent: 0 },
        },
      },
    },
  };
}

describe("buildComponentLocalDependencySummary", () => {
  it("aggregates local component wrappers under the child DS component", () => {
    const summary = buildComponentLocalDependencySummary([
      makeConsumer("consumer-a", "56921761019697e40ee843f0f1ddb69025bc4f1e", "Componenete_1", "b108083c4772c41879b8028866c029d293291c8c", "Variant=Accent", 1),
      makeConsumer("consumer-b", "56921761019697e40ee843f0f1ddb69025bc4f1e", "Componenete_1", "b108083c4772c41879b8028866c029d293291c8c", "Variant=Accent", 2),
    ]);

    const deps = summary.get("b108083c4772c41879b8028866c029d293291c8c");
    assert.ok(deps);
    assert.deepEqual(deps.get("56921761019697e40ee843f0f1ddb69025bc4f1e"), {
      componentKey: "56921761019697e40ee843f0f1ddb69025bc4f1e",
      componentName: "Componenete_1",
      usageCount: 3,
      consumerCount: 2,
    });
  });
});

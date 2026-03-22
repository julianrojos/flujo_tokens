import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runSimulateChange } from "../lib/simulate-change-logic";

describe("runSimulateChange", () => {
  it("returns ok result on successful simulation", async () => {
    const apiCall = async () => ({
      ok: true,
      data: {
        variableKey: "color.primary.500",
        variableName: "Primary",
        variableType: "COLOR",
        proposedValue: "#0055FF",
        totalNodes: 12,
        totalConsumers: 2,
        impactLevel: "HIGH" as const,
        affectedConsumers: [],
        warnings: [],
        disclaimer: "Based on latest sync snapshots.",
      },
    });

    const result = await runSimulateChange(apiCall, {
      dsFileKey: "FILE_123",
      variableKey: "color.primary.500",
      proposedValue: "#0055FF",
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.totalNodes, 12);
      assert.equal(result.data.impactLevel, "HIGH");
    }
  });

  it("returns error result when simulation call fails", async () => {
    const error = new Error("network");
    const apiCall = async () => {
      throw error;
    };

    const result = await runSimulateChange(apiCall, {
      dsFileKey: "FILE_123",
      variableKey: "color.primary.500",
      proposedValue: "#0055FF",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, error);
    }
  });
});


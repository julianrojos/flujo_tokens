import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOperationSystemHeaders,
  resolveOperationSystemId,
} from "../src/hooks/use-operation-runner-logic";

describe("use-operation-runner helpers", () => {
  it("prefers explicit override system id", () => {
    const resolved = resolveOperationSystemId({
      overrideSystemId: "demo-02",
      activeSystemId: "iter",
    });
    assert.equal(resolved, "demo-02");
  });

  it("falls back to active system id when override is missing", () => {
    const resolved = resolveOperationSystemId({
      overrideSystemId: "",
      activeSystemId: "iter",
    });
    assert.equal(resolved, "iter");
  });

  it("builds x-ds-system header only when system id is present", () => {
    assert.deepEqual(buildOperationSystemHeaders("iter"), {
      "x-ds-system": "iter",
    });
    assert.deepEqual(buildOperationSystemHeaders(""), {});
  });
});

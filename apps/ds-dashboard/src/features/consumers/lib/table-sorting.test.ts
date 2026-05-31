import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareNullableNumbers,
  compareStrings,
  compareWeightedValues,
} from "./table-sorting";

describe("table-sorting", () => {
  it("compares nullable numbers with direction and null fallback", () => {
    assert.equal(compareNullableNumbers(null, 5, "asc"), -1);
    assert.equal(compareNullableNumbers(5, null, "asc"), 1);
    assert.equal(compareNullableNumbers(5, 5, "asc"), 0);
    assert.equal(compareNullableNumbers(1, 5, "desc"), 1);
  });

  it("compares strings with direction", () => {
    assert.equal(compareStrings("alpha", "beta", "asc"), -1);
    assert.equal(compareStrings("beta", "alpha", "desc"), -1);
  });

  it("compares weighted values by lookup table", () => {
    const weights = {
      LOW: 1,
      HIGH: 3,
      CRITICAL: 4,
    } as const;

    assert.equal(compareWeightedValues("LOW", "HIGH", "asc", weights), -1);
    assert.equal(compareWeightedValues("CRITICAL", "HIGH", "desc", weights), -1);
  });
});

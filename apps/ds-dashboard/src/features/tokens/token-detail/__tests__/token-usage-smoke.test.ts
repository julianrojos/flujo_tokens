import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TokenUsageSection } from "../components/token-usage-section";
import { TokenUsageInTokensSection } from "../components/token-usage-in-tokens-section";

describe("token usage smoke", () => {
  it("imports the token usage sections without module-level errors", () => {
    assert.equal(typeof TokenUsageSection, "function");
    assert.equal(typeof TokenUsageInTokensSection, "function");
  });
});

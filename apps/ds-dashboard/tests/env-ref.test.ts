import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeEnvRef } from "../src/lib/env-ref.ts";

describe("client env ref normalization", () => {
  it("normalizes uppercase env identifiers to ${VAR}", () => {
    assert.equal(normalizeEnvRef("FIGMA_TOKEN"), "${FIGMA_TOKEN}");
    assert.equal(normalizeEnvRef("$FIGMA_TOKEN"), "${FIGMA_TOKEN}");
    assert.equal(normalizeEnvRef("${FIGMA_TOKEN}"), "${FIGMA_TOKEN}");
  });

  it("keeps literal figma tokens as raw values", () => {
    assert.equal(normalizeEnvRef("figd_abc123"), "figd_abc123");
    assert.equal(normalizeEnvRef("figd_ABC123"), "figd_ABC123");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeEnvRef, resolveEnvRef } from "./env-ref-utils.ts";

describe("server env ref utils", () => {
  it("normalizes uppercase env identifiers to ${VAR}", () => {
    assert.equal(normalizeEnvRef("FIGMA_TOKEN"), "${FIGMA_TOKEN}");
    assert.equal(normalizeEnvRef("$FIGMA_TOKEN"), "${FIGMA_TOKEN}");
    assert.equal(normalizeEnvRef("${FIGMA_TOKEN}"), "${FIGMA_TOKEN}");
  });

  it("keeps literal figma tokens as raw values", () => {
    assert.equal(normalizeEnvRef("figd_abc123"), "figd_abc123");
  });

  it("resolves env refs but keeps raw literals untouched", () => {
    process.env.FIGMA_TOKEN_FOR_TEST = "figd_from_env";
    assert.equal(resolveEnvRef("${FIGMA_TOKEN_FOR_TEST}"), "figd_from_env");
    assert.equal(resolveEnvRef("figd_literal"), "figd_literal");
    delete process.env.FIGMA_TOKEN_FOR_TEST;
  });
});

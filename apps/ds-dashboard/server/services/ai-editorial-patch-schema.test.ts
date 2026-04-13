import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateEditorialPatch,
  EDITORIAL_PATCH_SCHEMA_VERSION,
} from "./ai-editorial-patch-schema";

function makePatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION, ...overrides };
}

describe("validateEditorialPatch", () => {
  it("accepts a minimal valid patch with only schemaVersion", () => {
    const result = validateEditorialPatch(makePatch());
    assert.strictEqual(result.valid, true);
  });

  it("accepts a full patch with all sections", () => {
    const result = validateEditorialPatch({
      schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
      summary: { purpose: "A button", when_to_use: "Actions", when_not_to_use: "Links" },
      content_guidelines: { rules: ["Use title case"] },
      behavior: {
        interactionPattern: "trigger",
        description: "Activating this component starts the primary action in the current context.",
        inferredFrom: "component name and states",
        notes: ["[To confirm with dev] Keyboard activation details."],
      },
      accessibility: { role: "button", labeling: { rules: ["Include name"] }, notes: ["Test with screen readers"] },
      qa: ["Verify focus ring"],
    });
    assert.strictEqual(result.valid, true);
  });

  it("rejects missing schemaVersion", () => {
    const result = validateEditorialPatch({ summary: { purpose: "x" } });
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "schemaVersion"));
    }
  });

  it("rejects wrong schemaVersion", () => {
    const result = validateEditorialPatch({ schemaVersion: 99 });
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "schemaVersion"));
    }
  });

  it("rejects unknown top-level properties", () => {
    const result = validateEditorialPatch(makePatch({ unknown_field: "x" }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "unknown_field"));
    }
  });

  it("rejects unknown properties inside sections", () => {
    const result = validateEditorialPatch(makePatch({
      summary: { purpose: "x", extra: "y" },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "summary.extra"));
    }
  });

  it("rejects best_practices as unknown top-level field", () => {
    const result = validateEditorialPatch(makePatch({
      best_practices: { do: ["legacy"] },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "best_practices"));
    }
  });

  it("rejects non-array values where array expected", () => {
    const result = validateEditorialPatch(makePatch({
      content_guidelines: { rules: "not an array" },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "content_guidelines.rules"));
    }
  });

  it("rejects non-string values in summary", () => {
    const result = validateEditorialPatch(makePatch({
      summary: { purpose: 42 },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "summary.purpose"));
    }
  });

  it("rejects non-object input", () => {
    assert.strictEqual(validateEditorialPatch(null).valid, false);
    assert.strictEqual(validateEditorialPatch("string").valid, false);
    assert.strictEqual(validateEditorialPatch([]).valid, false);
    assert.strictEqual(validateEditorialPatch(42).valid, false);
  });

  it("accepts empty arrays in sections", () => {
    const result = validateEditorialPatch(makePatch({
      content_guidelines: { rules: [] },
      accessibility: { notes: [] },
    }));
    assert.strictEqual(result.valid, true);
  });

  it("accepts partial sections (only some fields present)", () => {
    const result = validateEditorialPatch(makePatch({
      summary: { purpose: "x" },
      behavior: { interactionPattern: "unknown" },
      accessibility: { role: "dialog" },
    }));
    assert.strictEqual(result.valid, true);
  });

  it("rejects behavior.interactionPattern outside allowed enum", () => {
    const result = validateEditorialPatch(makePatch({
      behavior: { interactionPattern: "verified" },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "behavior.interactionPattern"));
    }
  });

  it("rejects unknown properties inside nested accessibility.labeling", () => {
    const result = validateEditorialPatch(makePatch({
      accessibility: { labeling: { rules: ["x"], extra: "y" } },
    }));
    assert.strictEqual(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((e) => e.path === "accessibility.labeling.extra"));
    }
  });

});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SUGGESTION_SECTION_MAP, applySectionAction } from "../constants/suggestion-section-map";

describe("suggestion-section-map", () => {
  it("keeps the expected sections exposed to the UI", () => {
    assert.deepEqual(Object.keys(SUGGESTION_SECTION_MAP), [
      "summary",
      "variants",
      "tokens",
      "accessibilityNotes",
    ]);
  });

  it("extracts mapped values from suggestion payload", () => {
    const suggestion = {
      summary: "Button summary",
      variants: [{ id: "v1", name: "Default", description: "", properties: {} }],
      tokens: [{ name: "color.primary", value: "#000", type: "color" }],
      accessibilityNotes: ["Has visible focus"],
    } as const;

    assert.equal(SUGGESTION_SECTION_MAP.summary.extract(suggestion as never), "Button summary");
    assert.deepEqual(SUGGESTION_SECTION_MAP.variants.extract(suggestion as never), suggestion.variants);
    assert.deepEqual(SUGGESTION_SECTION_MAP.tokens.extract(suggestion as never), suggestion.tokens);
    assert.deepEqual(SUGGESTION_SECTION_MAP.accessibilityNotes.extract(suggestion as never), suggestion.accessibilityNotes);
  });
});

describe("applySectionAction", () => {
  const base = {
    summary: "",
    variants: [],
    tokens: [],
    accessibilityNotes: [],
  };

  it("applies summary", () => {
    const result = applySectionAction({ type: "SET_SUMMARY", payload: "Updated" }, base);
    assert.equal(result.summary, "Updated");
  });

  it("applies variants", () => {
    const variants = [{ id: "v1", name: "Default", description: "", properties: {} }];
    const result = applySectionAction({ type: "SET_VARIANTS", payload: variants }, base);
    assert.deepEqual(result.variants, variants);
  });

  it("applies tokens", () => {
    const tokens = [{ name: "color.primary", value: "#000", type: "color" }];
    const result = applySectionAction({ type: "SET_TOKENS", payload: tokens }, base);
    assert.deepEqual(result.tokens, tokens);
  });

  it("applies accessibility notes", () => {
    const notes = ["Keyboard navigable"];
    const result = applySectionAction({ type: "SET_ACC_NOTES", payload: notes }, base);
    assert.deepEqual(result.accessibilityNotes, notes);
  });
});

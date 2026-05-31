import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isStructuralFigmaVariantRow } from "./figma-variant-classification.js";

describe("figma-variant-classification", () => {
  it("treats rows with canonical keys as variant descriptions", () => {
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: "State=Default",
        properties_json: { state: "default" },
      }),
      false,
    );
  });

  it("treats rows with structural properties and no canonical key as variants", () => {
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: null,
        properties_json: { state: "default", size: "md" },
      }),
      true,
    );
  });

  it("treats stringified structural properties and no canonical key as variants", () => {
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: null,
        properties_json: JSON.stringify({ state: "default", size: "md" }),
      }),
      true,
    );
  });

  it("ignores empty or invalid property payloads", () => {
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: null,
        properties_json: {},
      }),
      false,
    );
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: null,
        properties_json: null,
      }),
      false,
    );
  });

  it("treats rows with run_id and no canonical key as structural variants", () => {
    assert.equal(
      isStructuralFigmaVariantRow({
        canonical_key: null,
        run_id: "run-123",
        properties_json: {},
      }),
      true,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getComponentTableDisplayInfo } from "./component-table-display";

describe("getComponentTableDisplayInfo", () => {
  it("uses the canonical parent label and derives the variant from the suffix", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Button/Variant=Accent",
      parentDisplayName: "Button",
    });

    assert.deepEqual(info, {
      componentLabel: "Button",
      variantLabel: "Variant=Accent",
    });
  });

  it("falls back to the parsed parent label when the canonical label is unavailable", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Button/Size=Large,State=Hover",
    });

    assert.deepEqual(info, {
      componentLabel: "Button",
      variantLabel: "Size=Large,State=Hover",
    });
  });

  it("keeps comma-based variant names split correctly when a canonical label is known", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Botón, Variant=Default",
      parentDisplayName: "Botón",
    });

    assert.deepEqual(info, {
      componentLabel: "Botón",
      variantLabel: "Variant=Default",
    });
  });

  it("uses the catalog parent when the report only carries the variant label", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Accent",
      parentDisplayName: "Button",
    });

    assert.deepEqual(info, {
      componentLabel: "Button",
      variantLabel: "Accent",
    });
  });

  it("returns an empty variant label when the component name matches the canonical parent", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Button",
      parentDisplayName: "Button",
    });

    assert.deepEqual(info, {
      componentLabel: "Button",
      variantLabel: "",
    });
  });

  it("treats singular and plural path segments as the same canonical component label", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "A11y/Dimension/Min-Hit-Area",
      parentDisplayName: "A11y/Dimensions",
    });

    assert.deepEqual(info, {
      componentLabel: "A11y/Dimensions",
      variantLabel: "Min-Hit-Area",
    });
  });

  it("keeps exact slash-based matches stable for parent names that end with s", () => {
    const info = getComponentTableDisplayInfo({
      componentName: "Canvas/Shape",
      parentDisplayName: "Canvas",
    });

    assert.deepEqual(info, {
      componentLabel: "Canvas",
      variantLabel: "Shape",
    });
  });
});

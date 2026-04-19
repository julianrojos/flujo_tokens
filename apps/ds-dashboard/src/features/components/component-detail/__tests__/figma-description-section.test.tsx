import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FigmaDescriptionSection } from "../components/figma-description-section";

describe("FigmaDescriptionSection", () => {
  it("renders descriptions even when there is no sync metadata", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription={null}
        variantDescriptions={[]}
      />,
    );
    assert.match(html, /Figma descriptions/);
    assert.match(html, /Variant descriptions/);
    assert.match(html, /—/);
  });

  it("renders component and variant descriptions when content exists", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription="Main button used for primary actions."
        variantDescriptions={[
          { canonicalKey: "Variant=Accent", description: "Used for high-emphasis actions." },
        ]}
      />,
    );

    assert.match(html, /Figma descriptions/);
    assert.match(html, /Main button used for primary actions\./);
    assert.match(html, /Variant descriptions/);
    assert.match(html, /Variant=Accent/);
    assert.match(html, /Used for high-emphasis actions\./);
  });

  it("does not show sync status badges", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription="Old text"
        variantDescriptions={[]}
      />,
    );

    assert.doesNotMatch(html, /Not synced/);
    assert.doesNotMatch(html, /Stale/);
  });
});

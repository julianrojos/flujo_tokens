import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FigmaDescriptionSection } from "../components/figma-description-section";

describe("FigmaDescriptionSection", () => {
  it("renders even when syncedAt is null", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription={null}
        variantDescriptions={[]}
        syncedAt={null}
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
        syncedAt={Math.floor(Date.now() / 1000)}
      />,
    );

    assert.match(html, /Figma descriptions/);
    assert.match(html, /Main button used for primary actions\./);
    assert.match(html, /Variant descriptions/);
    assert.match(html, /Variant=Accent/);
    assert.match(html, /Used for high-emphasis actions\./);
  });

  it("does not show stale indicator", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription="Old text"
        variantDescriptions={[]}
        syncedAt={Math.floor(Date.now() / 1000)}
      />,
    );

    assert.doesNotMatch(html, /Stale/);
  });

  it("shows not synced status when syncedAt is null", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription={null}
        variantDescriptions={[]}
        syncedAt={null}
      />,
    );

    assert.match(html, /Not synced/);
    assert.doesNotMatch(html, /Stale/);
  });
});

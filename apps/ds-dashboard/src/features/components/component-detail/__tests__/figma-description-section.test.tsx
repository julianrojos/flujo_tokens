import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FigmaDescriptionSection } from "../components/figma-description-section";

describe("FigmaDescriptionSection", () => {
  it("does not render when syncedAt is null", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription={null}
        variantDescriptions={[]}
        syncedAt={null}
        stale={true}
        onRefresh={() => {}}
      />,
    );
    assert.equal(html, "");
  });

  it("renders component and variant descriptions when content exists", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription="Main button used for primary actions."
        variantDescriptions={[
          { canonicalKey: "Variant=Accent", description: "Used for high-emphasis actions." },
        ]}
        syncedAt={Math.floor(Date.now() / 1000)}
        stale={false}
        onRefresh={() => {}}
      />,
    );

    assert.match(html, /Figma descriptions/);
    assert.match(html, /Main button used for primary actions\./);
    assert.match(html, /Variant descriptions/);
    assert.match(html, /Variant=Accent/);
    assert.match(html, /Used for high-emphasis actions\./);
  });

  it("shows stale indicator when stale is true", () => {
    const html = renderToStaticMarkup(
      <FigmaDescriptionSection
        componentSetDescription="Old text"
        variantDescriptions={[]}
        syncedAt={Math.floor(Date.now() / 1000)}
        stale={true}
        onRefresh={() => {}}
      />,
    );

    assert.match(html, /Stale/);
    assert.match(html, /data may be outdated/i);
  });
});

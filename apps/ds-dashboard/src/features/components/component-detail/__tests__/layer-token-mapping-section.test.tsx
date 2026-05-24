/**
 * Layer Token Mapping Section - unit tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { LayerTokenMappingSection } from "../components/layer-token-mapping-section";
import type { LayerTokenMappingEntry } from "../components/layer-token-mapping-section";
import type { TokenCatalog } from "@/types/token-catalog";

function makeEntry(overrides: Partial<LayerTokenMappingEntry> = {}): LayerTokenMappingEntry {
  return {
    variant_node_id: "10:0",
    variant_signature: "State=Default|Size=MD",
    layer_node_id: "10:1",
    layer_name: "Button",
    property_path: "fills",
    variable_id: "123:456",
    token_path: "primitives.blue.500",
    status: "resolved",
    mode_id: "mode:1",
    mode_name: "Default",
    ...overrides,
  };
}

describe("LayerTokenMappingSection", () => {
  const tokenCatalog: TokenCatalog = {
    entries: [],
    byPath: {
      "primitives.blue.500": {
        path: "primitives.blue.500",
        slashPath: "primitives/blue/500",
        cssVar: "--primitives-blue-500",
        type: "color",
        resolvedValue: "#0000ff",
        aliasOf: null,
        collection: "Primitives",
      },
    },
    bySlashPath: {},
    byVariableId: {},
  };

  function renderSection(
    entries: LayerTokenMappingEntry[],
    registry: TokenCatalog | null | undefined = tokenCatalog,
  ): string {
    return renderToStaticMarkup(
      <StaticRouter location="/">
        <LayerTokenMappingSection entries={entries} tokenCatalog={registry} />
      </StaticRouter>,
    );
  }

  function extractTbody(html: string): string {
    const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*)<\/tbody>/);
    assert.ok(bodyMatch, "tbody should exist");
    return bodyMatch[1] ?? "";
  }

  it("renders empty state when entries array is empty", () => {
    const html = renderSection([]);
    assert.match(html, /No token bindings yet/);
    assert.match(html, /Reimport this component from Figma/);
  });

  it("renders table headers with all expected columns", () => {
    const html = renderSection([makeEntry()]);
    assert.match(html, /Token/);
    assert.match(html, /Property/);
    assert.match(html, /Collection/);
    assert.match(html, /Variant/);
  });

  it("renders token link and collection in each row", () => {
    const html = renderSection([makeEntry()]);
    assert.match(html, /href=\"\/tokens\/primitives\.blue\.500\"/);
    assert.match(html, /Primitives/);
  });

  it("handles null tokenCatalog gracefully", () => {
    const html = renderSection([makeEntry()], null);
    const tbody = extractTbody(html);
    assert.match(tbody, /primitives\.blue\.500/);
    assert.match(tbody, /fills/);
    assert.equal((tbody.match(/—/g) || []).length, 1);
  });

  it("handles undefined tokenCatalog gracefully", () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <LayerTokenMappingSection entries={[makeEntry()]} tokenCatalog={undefined} />
      </StaticRouter>,
    );
    const tbody = extractTbody(html);
    assert.match(tbody, /primitives\.blue\.500/);
    assert.match(tbody, /fills/);
    assert.equal((tbody.match(/—/g) || []).length, 1);
  });

  it("renders one row per entry with correct data", () => {
    const entry = makeEntry();
    const html = renderSection([entry]);
    assert.match(html, /primitives\.blue\.500/);
    assert.match(html, /fills/);
    assert.match(html, /Primitives/);
    assert.match(html, /State=Default\|Size=MD/);
  });

  it("renders unresolved entries without token link", () => {
    const html = renderSection([makeEntry({
        status: "unresolved",
        token_path: null,
      })]);
    assert.match(html, /—/);
  });

  it("renders dash placeholder when no variant signature", () => {
    const html = renderSection([makeEntry({ variant_signature: "" })]);
    // The dash character used as placeholder
    assert.match(html, /—/);
  });

  it("renders dash placeholder when no mode", () => {
    const html = renderSection([makeEntry({ mode_name: "" })]);
    assert.match(html, /—/);
  });

  it("renders dash for missing token path", () => {
    const html = renderSection([makeEntry({ token_path: null })]);
    // Should show the dash placeholder for the token column
    assert.match(extractTbody(html), /—/);
  });

  it("renders multiple entries as separate rows", () => {
    const entries = [
      makeEntry({ layer_name: "Button", property_path: "fills" }),
      makeEntry({ layer_name: "Icon", property_path: "strokes" }),
    ];
    const html = renderSection(entries);
    assert.match(html, /Button/);
    assert.match(html, /Icon/);
    assert.match(html, /fills/);
    assert.match(html, /strokes/);
    // Should have count in header description
    assert.match(html, /2 bindings/);
  });
});

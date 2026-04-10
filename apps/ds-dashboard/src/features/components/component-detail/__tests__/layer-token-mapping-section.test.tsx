/**
 * Layer Token Mapping Section - unit tests
 */

import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { LayerTokenMappingSection } from "../components/layer-token-mapping-section";
import type { LayerTokenMappingEntry } from "../components/layer-token-mapping-section";

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
  it("renders empty state when entries array is empty", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[]} />,
    );
    assert.match(html, /No token bindings captured/);
  });

  it("renders table headers with all expected columns", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry()]} />,
    );
    assert.match(html, /Variant/);
    assert.match(html, /Layer/);
    assert.match(html, /Property/);
    assert.match(html, /Token/);
    assert.match(html, /Variable ID/);
    assert.match(html, /Mode/);
    assert.match(html, /Status/);
  });

  it("renders variable_id in each row", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry()]} />,
    );
    assert.match(html, /123:456/);
  });

  it("renders one row per entry with correct data", () => {
    const entry = makeEntry();
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[entry]} />,
    );
    assert.match(html, /State=Default\|Size=MD/);
    assert.match(html, /Button/);
    assert.match(html, /fills/);
    assert.match(html, /primitives\.blue\.500/);
    assert.match(html, /Default/);
  });

  it("shows status badge for resolved entries", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry({ status: "resolved" })]} />,
    );
    assert.match(html, /Resolved/);
  });

  it("shows status badge for unresolved entries", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry({
        status: "unresolved",
        token_path: null,
      })]} />,
    );
    assert.match(html, /Unresolved/);
  });

  it("renders dash placeholder when no variant signature", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry({ variant_signature: "" })]} />,
    );
    // The dash character used as placeholder
    assert.match(html, /—/);
  });

  it("renders dash placeholder when no mode", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry({ mode_name: "" })]} />,
    );
    assert.match(html, /—/);
  });

  it("renders dash for missing token path", () => {
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={[makeEntry({ token_path: null })]} />,
    );
    // Should show the dash placeholder for the token column
    const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*)<\/tbody>/);
    assert.ok(bodyMatch, "tbody should exist");
    assert.match(bodyMatch[1], /—/);
  });

  it("renders multiple entries as separate rows", () => {
    const entries = [
      makeEntry({ layer_name: "Button", property_path: "fills" }),
      makeEntry({ layer_name: "Icon", property_path: "strokes" }),
    ];
    const html = renderToStaticMarkup(
      <LayerTokenMappingSection entries={entries} />,
    );
    assert.match(html, /Button/);
    assert.match(html, /Icon/);
    assert.match(html, /fills/);
    assert.match(html, /strokes/);
    // Should have count in header description
    assert.match(html, /2 bindings/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { injectSpecZones } from "./spec-to-markdown-injector.mjs";

test("injectSpecZones - happy path with full boundaries", () => {
  const markdown = `
# Alert Component

Introductory prose.

## Anatomy
<!-- AUTO-GENERATED-ANATOMY:START -->
Old anatomy here.
<!-- AUTO-GENERATED-ANATOMY:END -->

## Properties
<!-- AUTO-GENERATED-PROPERTIES:START -->
Old props.
<!-- AUTO-GENERATED-PROPERTIES:END -->

## Visuals
<!-- AUTO-GENERATED-VISUALS:START -->
Old visuals.
<!-- AUTO-GENERATED-VISUALS:END -->

## Variants
<!-- AUTO-GENERATED-VARIANTS:START -->
Old variants.
<!-- AUTO-GENERATED-VARIANTS:END -->

Trailing prose.
`;

  const spec = {
    anatomy: [{ index: 1, name: "Container", type: "FRAME" }],
    properties: [{ name: "state", type: "variant", default: "info", required: true }],
    variants: [],
    layout: [{ node: "Container", direction: "Horizontal", hSizing: "Fill", vSizing: "Hug", alignment: "Top left", itemSpacing: 8 }]
  };

  const result = injectSpecZones(markdown, spec, "alert");

  assert.ok(result.includes("Introductory prose."), "Must preserve leading prose");
  assert.ok(result.includes("Trailing prose."), "Must preserve trailing prose");
  assert.ok(!result.includes("Old anatomy here."), "Must overwrite old anatomy");
  assert.ok(!result.includes("Old props."), "Must overwrite old properties");

  assert.ok(result.includes("1. **Container**"), "Must inject new anatomy");
  assert.ok(result.includes("⚠️ AUTO-GENERATED: DO NOT EDIT"), "Must include generation header");
  assert.ok(result.includes("Source: docs/_spec/components/alert.yml"), "Must include source doc slug");
});

test("injectSpecZones - appends new zones if tags are completely missing", () => {
  const markdown = `# Simple Component\n\nNo tags here.`;
  const spec = { anatomy: [], properties: [], variants: [], layout: [] };
  
  const result = injectSpecZones(markdown, spec, "simple");
  
  assert.ok(result.includes("No tags here."), "Must preserve prose");
  assert.ok(result.includes("<!-- AUTO-GENERATED-ANATOMY:START -->"), "Must append missing start tag");
  assert.ok(result.includes("<!-- AUTO-GENERATED-ANATOMY:END -->"), "Must append missing end tag");
});

test("injectSpecZones - throws on corrupted boundaries", () => {
  const markdown = `
# Alert Component
<!-- AUTO-GENERATED-ANATOMY:START -->
Missing the end tag...
`;
  const spec = { anatomy: [], properties: [], variants: [], layout: [] };

  assert.throws(
    () => injectSpecZones(markdown, spec, "alert"),
    /Corrupted boundaries for ANATOMY: Missing END tag/
  );
});

test("injectSpecZones - throws on multiple identical tags", () => {
  const markdown = `
# Alert Component
<!-- AUTO-GENERATED-ANATOMY:START -->
<!-- AUTO-GENERATED-ANATOMY:START -->
<!-- AUTO-GENERATED-ANATOMY:END -->
`;
  const spec = { anatomy: [], properties: [], variants: [], layout: [] };

  assert.throws(
    () => injectSpecZones(markdown, spec, "alert"),
    /Ambiguity for ANATOMY: Multiple identical tags found/
  );
});

test("injectSpecZones - throws on invalid input", () => {
  assert.throws(() => injectSpecZones(null, {}, "alert"), /Markdown content must be a string/);
  assert.throws(() => injectSpecZones("", null, "alert"), /YAML spec must be a valid object/);
});

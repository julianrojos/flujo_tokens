import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildComponentLookupMap,
  buildComponentSlugFallback,
  extractComponentParentAlias,
  normalizeComponentLookupKey,
  resolveKnownComponentSlug,
} from "./component-lookup.js";

describe("component-lookup", () => {
  it("normalizes lookup keys accent-insensitively", () => {
    assert.equal(normalizeComponentLookupKey("  Botón  "), "boton");
  });

  it("extracts parent alias from slash and comma variant formats", () => {
    assert.equal(extractComponentParentAlias("Button/Size=Large"), "Button");
    assert.equal(
      extractComponentParentAlias("Button, Size=Large, State=Hover"),
      "Button",
    );
    assert.equal(extractComponentParentAlias("Button, notes"), "Button, notes");
  });

  it("keeps exact slug/display matches even when alias is ambiguous", () => {
    const lookup = buildComponentLookupMap([
      { display_name: "Button", slug: "button" },
      { display_name: "Button/Variant=Default", slug: "button-default" },
      { display_name: "Button/Variant=Accent", slug: "button-accent" },
    ]);

    assert.equal(lookup["button"], "button");
    assert.equal(lookup["button/variant=default"], "button-default");
    assert.equal(lookup["button/variant=accent"], "button-accent");
  });

  it("excludes ambiguous normalized keys from lookup", () => {
    const lookup = buildComponentLookupMap([
      { display_name: "Button", slug: "button-v1" },
      { display_name: "Button", slug: "button-v2" },
    ]);
    assert.equal(lookup["button"], undefined);
  });

  it("resolves slug by parent name first", () => {
    const lookup = buildComponentLookupMap([
      { display_name: "Botón", slug: "button" },
      { display_name: "Botón/Variant=Accent", slug: "button-accent" },
    ]);

    const resolved = resolveKnownComponentSlug({
      lookup,
      parentName: "botón",
      variantName: "botón/variant=accent",
    });
    assert.equal(resolved, "button");
  });

  it("resolves slug by variant name when parent does not match", () => {
    const lookup = buildComponentLookupMap([
      { display_name: "Button/Variant=Accent", slug: "button-accent" },
    ]);

    const resolved = resolveKnownComponentSlug({
      lookup,
      parentName: "Unknown",
      variantName: "Button/Variant=Accent",
    });
    assert.equal(resolved, "button-accent");
  });

  it("uses fallback slug only when it exists in lookup", () => {
    const fallbackSlug = buildComponentSlugFallback("Botón Principal");
    assert.equal(fallbackSlug, "boton-principal");

    const resolvedKnown = resolveKnownComponentSlug({
      lookup: { "boton-principal": "boton-principal" },
      parentName: "Botón Principal",
      variantName: "",
    });
    assert.equal(resolvedKnown, "boton-principal");

    const resolvedUnknown = resolveKnownComponentSlug({
      lookup: {},
      parentName: "Botón Principal",
      variantName: "",
    });
    assert.equal(resolvedUnknown, undefined);
  });

  it("returns undefined for empty parent and variant names", () => {
    const resolved = resolveKnownComponentSlug({
      lookup: {},
      parentName: "",
      variantName: "",
    });
    assert.equal(resolved, undefined);
  });

  it("returns undefined when parent and variant do not match lookup", () => {
    const lookup = buildComponentLookupMap([
      { display_name: "Card", slug: "card" },
    ]);
    const resolved = resolveKnownComponentSlug({
      lookup,
      parentName: "Button",
      variantName: "Button/Variant=Default",
    });
    assert.equal(resolved, undefined);
  });
});

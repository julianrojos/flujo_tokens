import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TokenCatalogEntry } from "@/types/token-catalog";
import { normalizeResolvedValueKey } from "@/lib/token-value-normalize";
import {
  buildSharedValueClusters,
  resolveClusterFill,
  summarizeSharedValues,
} from "./token-shared-value-clusters";

function makeEntry(overrides: Partial<TokenCatalogEntry> = {}): TokenCatalogEntry {
  return {
    path: "tokens.sample.one",
    slashPath: "tokens/sample/one",
    cssVar: "--tokens-sample-one",
    type: "color",
    resolvedValue: "#ffffff",
    aliasOf: null,
    collection: "Primitives",
    ...overrides,
  };
}

describe("token-shared-value-clusters", () => {
  it("normalizes hex values to a stable grouping key", () => {
    assert.equal(normalizeResolvedValueKey("#fff"), "#FFFFFF");
    assert.equal(normalizeResolvedValueKey("#ffffff"), "#FFFFFF");
    assert.equal(normalizeResolvedValueKey("  16px  "), "16px");
  });

  it("groups tokens by shared resolved value and filters singletons", () => {
    const clusters = buildSharedValueClusters([
      makeEntry({ path: "tokens.a", resolvedValue: "#ffffff" }),
      makeEntry({ path: "tokens.b", resolvedValue: "#FFFFFF" }),
      makeEntry({ path: "tokens.c", resolvedValue: "16px", type: "dimension", collection: "Semantic" }),
      makeEntry({ path: "tokens.d", resolvedValue: "16px", type: "dimension", collection: "Semantic" }),
      makeEntry({ path: "tokens.e", resolvedValue: "single", type: "string", collection: "Semantic" }),
    ]);

    assert.equal(clusters.length, 2);
    assert.equal(clusters[0]?.label, "#ffffff");
    assert.equal(clusters[0]?.count, 2);
    assert.equal(clusters[1]?.label, "16px");
    assert.equal(clusters[1]?.tokens[0]?.path, "tokens.c");
  });

  it("summarizes the cluster set", () => {
    const clusters = buildSharedValueClusters([
      makeEntry({ path: "tokens.a", resolvedValue: "#ffffff" }),
      makeEntry({ path: "tokens.b", resolvedValue: "#FFFFFF" }),
      makeEntry({ path: "tokens.c", resolvedValue: "#ffffff" }),
    ]);

    assert.deepEqual(summarizeSharedValues(clusters), {
      uniqueValues: 1,
      sharedTokens: 3,
      duplicateExcess: 2,
      topCount: 3,
    });
  });

  it("excludes unresolved var() references from clustering", () => {
    const clusters = buildSharedValueClusters([
      makeEntry({ path: "tokens.a", resolvedValue: "var(--some-token)" }),
      makeEntry({ path: "tokens.b", resolvedValue: "var(--some-token)" }),
      makeEntry({ path: "tokens.c", resolvedValue: "#ff0000" }),
      makeEntry({ path: "tokens.d", resolvedValue: "#ff0000" }),
    ]);

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]?.label, "#ff0000");
  });

  it("assigns palette fill colors based on display order (post-sort), not insertion order", () => {
    // Build a scenario where sort changes the order:
    // tokens.a+b share "#aabbcc" (2 tokens)
    // tokens.c+d+e share "8px" (3 tokens) — should be sorted first
    const clusters = buildSharedValueClusters([
      makeEntry({ path: "tokens.a", resolvedValue: "#aabbcc" }),
      makeEntry({ path: "tokens.b", resolvedValue: "#aabbcc" }),
      makeEntry({ path: "tokens.c", resolvedValue: "8px", type: "dimension" }),
      makeEntry({ path: "tokens.d", resolvedValue: "8px", type: "dimension" }),
      makeEntry({ path: "tokens.e", resolvedValue: "8px", type: "dimension" }),
    ]);

    // After sort: "8px" (3) comes before "#aabbcc" (2)
    assert.equal(clusters[0]?.label, "8px");
    assert.equal(clusters[1]?.label, "#aabbcc");

    // Color clusters use their own hex as fill, so palette index irrelevant for colors
    assert.equal(clusters[1]?.fill, "#AABBCC");

    // Non-color clusters: index 0 (post-sort) gets palette[0]
    const expectedFill = resolveClusterFill({ key: "8px", label: "8px" }, 0);
    assert.equal(clusters[0]?.fill, expectedFill);
  });
});

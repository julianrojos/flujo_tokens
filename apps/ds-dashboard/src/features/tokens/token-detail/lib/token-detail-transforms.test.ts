import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TokenCatalogEntry } from "../../../../types/token-catalog";
import { deriveTokenDisplayType } from "./token-detail-transforms";

function makeToken(overrides: Partial<TokenCatalogEntry> = {}): TokenCatalogEntry {
  return {
    path: "semanticos.color.bg-accent",
    slashPath: "semanticos/color/bg-accent",
    cssVar: "--semanticos-color-bg-accent",
    type: "color",
    resolvedValue: "#000000",
    collection: "semanticos",
    ...overrides,
  };
}

describe("deriveTokenDisplayType", () => {
  it("prefers color when the resolved value is a hex color", () => {
    const token = makeToken({ type: "string", resolvedValue: "Gray.100" });
    assert.equal(
      deriveTokenDisplayType({
        token,
        resolvedValue: "#F5F5F5",
      }),
      "color",
    );
  });

  it("keeps dimension when the resolved value is dimensional", () => {
    const token = makeToken({ type: "string", resolvedValue: "Scale 03" });
    assert.equal(
      deriveTokenDisplayType({
        token,
        resolvedValue: "16px",
      }),
      "dimension",
    );
  });
});

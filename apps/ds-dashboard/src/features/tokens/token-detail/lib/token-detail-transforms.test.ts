import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TokenCatalogEntry } from "../../../../types/token-catalog";
import {
  buildTokenUsageTargets,
  deriveTokenDisplayType,
  normalizeUsageKeyForMatch,
  variableReportMatchesTokenTargets,
} from "./token-detail-transforms";

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

describe("normalizeUsageKeyForMatch", () => {
  it("keeps dashes inside segment names", () => {
    assert.equal(normalizeUsageKeyForMatch("semanticos.color.bg-accent"), "color/bg-accent");
  });

  it("normalizes dots and underscores to slash", () => {
    assert.equal(
      normalizeUsageKeyForMatch("semanticos_color_bg.accent"),
      "semanticos/color/bg/accent",
    );
  });
});

describe("variableReportMatchesTokenTargets", () => {
  it("matches by normalized variableName", () => {
    const token = makeToken();
    const targets = buildTokenUsageTargets(token);
    assert.equal(
      variableReportMatchesTokenTargets(
        { variableName: "color/bg-accent", variableKey: "f".repeat(40) },
        targets,
      ),
      true,
    );
  });

  it("does not force-match hyphenated flat names into hierarchy", () => {
    const token = makeToken();
    const targets = buildTokenUsageTargets(token);
    assert.equal(
      variableReportMatchesTokenTargets(
        { variableName: "color-bg-accent", variableKey: "f".repeat(40) },
        targets,
      ),
      false,
    );
  });

  it("matches by exact variableName fallback", () => {
    const token = makeToken({ slashPath: "color/background/accent" });
    const targets = buildTokenUsageTargets(token);
    assert.equal(
      variableReportMatchesTokenTargets(
        { variableName: "color/background/accent", variableKey: "e".repeat(40) },
        targets,
      ),
      true,
    );
  });

  it("cannot match by variableKey unless the token target includes that key", () => {
    const token = makeToken();
    const targets = buildTokenUsageTargets(token);
    assert.equal(
      variableReportMatchesTokenTargets(
        { variableName: "unrelated/name", variableKey: "a".repeat(40) },
        targets,
      ),
      false,
    );
  });
});

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

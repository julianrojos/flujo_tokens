import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTokenLookups,
  resolveVariableTokenEntry,
} from "../consumer-detail-lookups";

describe("consumer detail lookups", () => {
  it("resolves exact and fallback token entries", () => {
    const lookups = buildTokenLookups([
      {
        path: "Theme/Colors/Primary",
        slashPath: "theme/colors/primary",
        cssVar: "--theme-colors-primary",
        collection: "Theme",
      },
    ]);

    assert.deepEqual(lookups.exact["theme/colors/primary"], {
      path: "Theme/Colors/Primary",
      slashPath: "theme/colors/primary",
      collection: "Theme",
    });
    assert.equal(
      resolveVariableTokenEntry(
        "Theme/Colors/Primary",
        "theme-colors-primary",
        lookups.exact,
        lookups.fallback,
      )?.path,
      "Theme/Colors/Primary",
    );
  });

  it("disables ambiguous normalized fallback keys", () => {
    const lookups = buildTokenLookups([
      {
        path: "Semanticos/Text/Default",
        slashPath: "semanticos/text/default",
        cssVar: "--semantic-text-default",
        collection: "Semantic",
      },
      {
        path: "semanticos.text.default",
        slashPath: "semanticos/text/default-alt",
        cssVar: "--semantic-text-default-alt",
        collection: "Semantic Alt",
      },
    ]);

    assert.equal(lookups.fallback["text/default"], null);
    assert.equal(
      resolveVariableTokenEntry("text.default", "text.default", lookups.exact, lookups.fallback),
      null,
    );
  });
});

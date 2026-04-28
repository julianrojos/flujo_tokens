import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeFigmaApiTokenRef,
  resolveSafeSystemPathsForDeletion,
  summarizeDesignSystemsConfig,
} from "./system-utils.js";

describe("resolveSafeSystemPathsForDeletion", () => {
  it("includes design-systems/<id> root path so delete can remove empty system directory", () => {
    const paths = resolveSafeSystemPathsForDeletion(
      { id: "sys-01" },
      "/repo",
      [{ id: "sys-02" }],
    );

    assert.deepEqual(paths, [
      "/repo/design-systems/sys-01",
      "/repo/design-systems/sys-01/input",
      "/repo/design-systems/sys-01/output",
      "/repo/design-systems/sys-01/docs",
    ]);
  });
});

describe("normalizeFigmaApiTokenRef", () => {
  it("normalizes env:VAR into ${VAR} reference", () => {
    assert.equal(normalizeFigmaApiTokenRef("env:FIGMA_TOKEN"), "${FIGMA_TOKEN}");
  });

  it("keeps literal tokens untouched", () => {
    assert.equal(normalizeFigmaApiTokenRef("figd_literal_token"), "figd_literal_token");
  });

  it("uses fallback env key as canonical reference", () => {
    assert.equal(normalizeFigmaApiTokenRef("", "FIGMA_TOKEN"), "${FIGMA_TOKEN}");
  });
});

describe("summarizeDesignSystemsConfig", () => {
  it("preserves database provider metadata when present", () => {
    const summary = summarizeDesignSystemsConfig({
      systems: [
        {
          id: "sys-01",
          name: "System 01",
          databaseProvider: "supabase",
        },
      ],
      defaultSystem: "sys-01",
    });

    assert.deepEqual(summary, {
      systems: [
        {
          id: "sys-01",
          name: "System 01",
          databaseProvider: "supabase",
        },
      ],
      defaultSystem: "sys-01",
    });
  });
});

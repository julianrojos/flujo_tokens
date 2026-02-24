import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { resolveDocsPaths } from "./capture-path-resolver.mjs";

test("capture-path-resolver: resolves docs root when context docs dir is provided", () => {
  const ctx = { paths: { docs: path.resolve("docs") } };
  const result = resolveDocsPaths({
    ctx,
    docsRootOverride: null,
    slug: "button",
  });

  assert.equal(result.docsRootDir, path.resolve("docs"));
  assert.equal(result.componentDocsDir, path.resolve("docs", "components"));
  assert.equal(result.markdownPath, path.resolve("docs", "components", "button.md"));
  assert.equal(result.specPath, path.resolve("docs", "_spec", "components", "button.yml"));
});

test("capture-path-resolver: handles explicit docs/components override", () => {
  const ctx = { paths: { docs: path.resolve("docs") } };
  const result = resolveDocsPaths({
    ctx,
    docsRootOverride: path.resolve("custom", "components"),
    slug: "alert",
  });

  assert.equal(result.docsRootDir, path.resolve("custom"));
  assert.equal(result.componentDocsDir, path.resolve("custom", "components"));
  assert.equal(result.markdownPath, path.resolve("custom", "components", "alert.md"));
  assert.equal(result.specPath, path.resolve("custom", "_spec", "components", "alert.yml"));
});

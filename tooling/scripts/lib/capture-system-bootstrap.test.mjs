import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  inferCollectionsFromInputDir,
  runTokensCompileIfNeeded,
  toCollectionLabel,
} from "./capture-system-bootstrap.mjs";

test("capture-system-bootstrap: toCollectionLabel normalizes file names", () => {
  assert.equal(toCollectionLabel("semantic_tokens.json"), "Semantic Tokens");
});

test("capture-system-bootstrap: inferCollectionsFromInputDir derives collections from json files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-bootstrap-"));
  fs.writeFileSync(path.join(tempDir, "primitives.json"), "{}", "utf8");
  fs.writeFileSync(path.join(tempDir, "typography.json"), "{}", "utf8");

  const collections = inferCollectionsFromInputDir(tempDir, ".");
  assert.equal(collections.includes("Primitives"), true);
  assert.equal(collections.includes("Typography"), true);
});

test("capture-system-bootstrap: runTokensCompileIfNeeded exits early without system", () => {
  const result = runTokensCompileIfNeeded({ repoRoot: process.cwd(), system: null });
  assert.equal(result.attempted, false);
  assert.equal(result.reason, "system-missing");
});

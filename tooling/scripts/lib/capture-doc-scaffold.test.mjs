import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarkdownSeed,
  buildOverviewSeed,
  ensureSystemDocsScaffold,
  writeTextAtomic,
} from "./capture-doc-scaffold.mjs";

test("capture-doc-scaffold: writeTextAtomic writes file content", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-docs-"));
  const targetPath = path.join(tempDir, "a", "b", "file.md");
  writeTextAtomic(targetPath, "hello");
  assert.equal(fs.readFileSync(targetPath, "utf8"), "hello");
});

test("capture-doc-scaffold: ensureSystemDocsScaffold creates required directories and overview", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-docs-"));
  const docsRootDir = path.join(tempDir, "docs");
  const componentDocsDir = path.join(docsRootDir, "components");

  const result = ensureSystemDocsScaffold({ docsRootDir, componentDocsDir });
  assert.equal(fs.existsSync(result.specsDir), true);
  assert.equal(fs.existsSync(result.generatedDir), true);
  assert.equal(fs.existsSync(result.overviewPath), true);
  assert.match(fs.readFileSync(result.overviewPath, "utf8"), /# Components Overview/);
});

test("capture-doc-scaffold: buildMarkdownSeed includes component metadata placeholders", () => {
  const seed = buildMarkdownSeed({
    slug: "button",
    candidateName: "Primary Button",
    nodeUrl: "https://figma.com/node",
    nodeId: "10:20",
  });
  assert.match(seed, /doc_type: component/);
  assert.match(seed, /component_set_node_id: 10:20/);
  assert.match(seed, /# PrimaryButton/);
});

test("capture-doc-scaffold: buildOverviewSeed is deterministic", () => {
  assert.equal(buildOverviewSeed(), buildOverviewSeed());
});

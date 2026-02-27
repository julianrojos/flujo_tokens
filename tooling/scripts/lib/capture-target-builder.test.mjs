import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureTargets } from "../../src/services/capture-target-builder.js";

test("capture-target-builder: skips candidate when requireExistingDoc=true and markdown missing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-builder-"));
  const docsDir = path.join(tempDir, "docs");
  const componentDir = path.join(docsDir, "components");
  fs.mkdirSync(componentDir, { recursive: true });

  const result = await buildCaptureTargets({
    sourceCandidates: [{ node_id: "1:1", name: "Button", kind: "component_set", page_name: "Page" }],
    descriptor: { fileKey: "abc", sourceUrl: "https://figma.com/file/abc", nodeIdFromUrl: "1:1" },
    ctx: { paths: { docs: docsDir } },
    docsRootOverride: docsDir,
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: new Map([["1:1", "button"]]),
    slugByNodeFromSpecs: new Map(),
    requireExistingDoc: true,
    injectDocSpecs: false,
    includeSpecExhibits: false,
    figmaToken: "token",
    repoRoot: tempDir,
    ensureFilePayload: async () => ({ document: {} }),
    fetchFigmaNodes: async () => ({ nodes: {} }),
    fetchFigmaImages: async () => ({ images: {} }),
    extractComponentSpec: () => ({}),
    resolveSpecExhibitNodeIds: () => null,
    resolveDocsPaths: ({ slug }) => ({
      markdownPath: path.join(componentDir, `${slug}.md`),
      specPath: path.join(docsDir, "_spec", "components", `${slug}.yml`),
    }),
    buildFigmaNodeUrl: () => "https://figma.com/node",
    classifyTargetKind: () => "component_set",
    renderEnrichedMarkdownSeed: () => "",
    injectExtractedSpecSectionsIntoMarkdown: (content) => ({ changed: false, content }),
    buildMarkdownSeed: () => "",
    writeTextAtomic: () => {},
    stderrWrite: () => {},
    markdownExistsFn: () => false,
    specExistsFn: () => false,
    readMarkdownContentFn: () => "",
  });

  assert.equal(result.targets.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "markdown-missing");
});

test("capture-target-builder: handles corrupted spec YAML (array instead of object) safely", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-builder-corrupt-"));
  const docsDir = path.join(tempDir, "docs");
  const componentDir = path.join(docsDir, "components");
  const specDir = path.join(docsDir, "_spec", "components");
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(componentDir, { recursive: true });

  // Write corrupted spec (array instead of object)
  const corruptSpecPath = path.join(specDir, "button.yml");
  fs.writeFileSync(corruptSpecPath, "- item1\n- item2\n", "utf8");

  // Write existing markdown
  const markdownPath = path.join(componentDir, "button.md");
  fs.writeFileSync(markdownPath, "# Button\n\nContent\n", "utf8");

  const result = await buildCaptureTargets({
    sourceCandidates: [{ node_id: "1:1", name: "Button", kind: "component_set", page_name: "Page" }],
    descriptor: { fileKey: "abc", sourceUrl: "https://figma.com/file/abc", nodeIdFromUrl: "1:1" },
    ctx: { paths: { docs: docsDir } },
    docsRootOverride: docsDir,
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: new Map([["1:1", "button"]]),
    slugByNodeFromSpecs: new Map(),
    requireExistingDoc: false,
    injectDocSpecs: true,
    includeSpecExhibits: false,
    figmaToken: "token",
    repoRoot: tempDir,
    ensureFilePayload: async () => ({ document: {} }),
    fetchFigmaNodes: async () => ({ nodes: { "1:1": { document: { name: "Button" } } } }),
    fetchFigmaImages: async () => ({ images: {} }),
    extractComponentSpec: (node) => ({
      anatomy: [],
      properties: [],
      layoutTree: { name: "Button", type: "FRAME" },
      variantProperties: [],
    }),
    resolveSpecExhibitNodeIds: () => null,
    resolveDocsPaths: ({ slug }) => ({
      markdownPath: path.join(componentDir, `${slug}.md`),
      specPath: path.join(specDir, `${slug}.yml`),
    }),
    buildFigmaNodeUrl: () => "https://figma.com/node",
    classifyTargetKind: () => "component_set",
    renderEnrichedMarkdownSeed: () => "",
    injectSpecZones: (content) => content,
    writeTextAtomic: async () => {},
    stderrWrite: () => {},
    markdownExistsFn: (p) => p === markdownPath,
    specExistsFn: (p) => p === corruptSpecPath,
    readMarkdownContentFn: () => "# Button\n\nContent\n",
  });

  // Should not crash - should handle corrupted YAML gracefully
  assert.equal(result.targets.length, 1);
  assert.equal(result.skipped.length, 0);
});

test("capture-target-builder: handles primitive YAML spec (string instead of object) safely", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-builder-primitive-"));
  const docsDir = path.join(tempDir, "docs");
  const componentDir = path.join(docsDir, "components");
  const specDir = path.join(docsDir, "_spec", "components");
  fs.mkdirSync(specDir, { recursive: true });
  fs.mkdirSync(componentDir, { recursive: true });

  // Write primitive spec (string instead of object)
  const primitiveSpecPath = path.join(specDir, "button.yml");
  fs.writeFileSync(primitiveSpecPath, "just a string value", "utf8");

  // Write existing markdown
  const markdownPath = path.join(componentDir, "button.md");
  fs.writeFileSync(markdownPath, "# Button\n\nContent\n", "utf8");

  const result = await buildCaptureTargets({
    sourceCandidates: [{ node_id: "1:1", name: "Button", kind: "component_set", page_name: "Page" }],
    descriptor: { fileKey: "abc", sourceUrl: "https://figma.com/file/abc", nodeIdFromUrl: "1:1" },
    ctx: { paths: { docs: docsDir } },
    docsRootOverride: docsDir,
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: new Map([["1:1", "button"]]),
    slugByNodeFromSpecs: new Map(),
    requireExistingDoc: false,
    injectDocSpecs: true,
    includeSpecExhibits: false,
    figmaToken: "token",
    repoRoot: tempDir,
    ensureFilePayload: async () => ({ document: {} }),
    fetchFigmaNodes: async () => ({ nodes: { "1:1": { document: { name: "Button" } } } }),
    fetchFigmaImages: async () => ({ images: {} }),
    extractComponentSpec: (node) => ({
      anatomy: [],
      properties: [],
      layoutTree: { name: "Button", type: "FRAME" },
      variantProperties: [],
    }),
    resolveSpecExhibitNodeIds: () => null,
    resolveDocsPaths: ({ slug }) => ({
      markdownPath: path.join(componentDir, `${slug}.md`),
      specPath: path.join(specDir, `${slug}.yml`),
    }),
    buildFigmaNodeUrl: () => "https://figma.com/node",
    classifyTargetKind: () => "component_set",
    renderEnrichedMarkdownSeed: () => "",
    injectSpecZones: (content) => content,
    writeTextAtomic: async () => {},
    stderrWrite: () => {},
    markdownExistsFn: (p) => p === markdownPath,
    specExistsFn: (p) => p === primitiveSpecPath,
    readMarkdownContentFn: () => "# Button\n\nContent\n",
  });

  // Should not crash - should handle primitive YAML gracefully
  assert.equal(result.targets.length, 1);
  assert.equal(result.skipped.length, 0);
});

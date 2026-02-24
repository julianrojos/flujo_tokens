import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureTargets } from "./capture-target-builder.mjs";

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
  });

  assert.equal(result.targets.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "markdown-missing");
});

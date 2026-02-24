import assert from "node:assert/strict";
import test from "node:test";

import { createCaptureReport } from "./capture-report.mjs";

test("capture-report: createCaptureReport returns deterministic shape", () => {
  const report = createCaptureReport({
    dryRun: true,
    descriptor: {
      sourceUrl: "https://figma.com/file/abc",
      fileKey: "abc",
      nodeIdFromUrl: "1:1",
    },
    requested: {
      component_kind: "component_set",
      include_variants: true,
      variant_limit: 6,
      scale: 2,
      format: "png",
      require_existing_doc: true,
      main_capture_mode: "rest",
      inject_doc_specs: false,
      include_spec_exhibits: true,
    },
    tokenBootstrap: { attempted: false, created: false, reason: "not-run" },
    tokenCompile: { attempted: false, compiled: false, reason: "not-run" },
    sourceCandidates: [{ node_id: "1:1" }],
    targets: [
      {
        slug: "button",
        nodeId: "1:1",
        kind: "component_set",
        pageName: "Components",
        markdownPath: "/repo/docs/components/button.md",
        specPath: "/repo/docs/_spec/components/button.yml",
        specExists: true,
        nodeUrl: "https://figma.com/node",
        specExhibits: {
          specsNodeId: "2:2",
          anatomy: { nodeId: "2:3", imageUrl: "https://img/anatomy.png" },
          properties: null,
          layout: null,
        },
      },
    ],
    skipped: [],
    repoRoot: "/repo",
  });

  assert.equal(report.ok, true);
  assert.equal(report.total_candidates, 1);
  assert.equal(report.targets_total, 1);
  assert.equal(report.targets[0].slug, "button");
  assert.equal(report.targets[0].markdown_path, "docs/components/button.md");
  assert.equal(report.targets[0].spec_path, "docs/_spec/components/button.yml");
  assert.equal(report.targets[0].spec_exhibits.specs_node_id, "2:2");
});

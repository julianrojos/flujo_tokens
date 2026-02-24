import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runCaptureFromFigmaUrl } from "./capture-orchestrator-main.mjs";
import { createCaptureContextMock } from "./mock-factories.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("capture characterization: exactly matches golden report", async () => {
  const goldenReportPath = path.join(__dirname, "golden-samples", "capture-report-golden.json");
  const goldenReportRaw = await fs.readFile(goldenReportPath, "utf-8");
  const goldenReport = JSON.parse(goldenReportRaw);

  const mockDeps = createCaptureContextMock({
    projectRoot: "/mock/repo",
    getSystemConfigFn: () => null,
    bootstrapInputJsonFromFigmaVariablesFn: async () => ({
      attempted: true,
      created: false,
      reason: "already-exists",
    }),
    ensureCollectionsConfiguredFn: () => {},
    runTokensCompileIfNeededFn: () => ({
      attempted: true,
      compiled: false,
      reason: "up-to-date",
    }),
    extractSingleNodeCandidateFn: () => ({
      node_id: "100:200",
      name: "Example Button",
      kind: "component_set",
      page_name: "Components",
    }),
    ensureSystemDocsScaffoldFn: () => ({}),
    buildCaptureTargetsFn: async () => ({
      targets: [
        {
          slug: "example-button",
          nodeId: "100:200",
          kind: "component_set",
          pageName: "Components",
          markdownPath: "/mock/repo/docs/components/example-button.md",
          specPath: "/mock/repo/docs/_spec/components/example-button.yml",
          specExists: true,
          nodeUrl: "https://www.figma.com/design/example-file/Components?node-id=100-200",
          specExhibits: null,
        },
      ],
      skipped: [],
    }),
    createCaptureReportFn: (params) => {
      // Create exact structure matching golden
      return {
        ok: true,
        dryRun: params.dryRun,
        source: {
          url: params.descriptor.sourceUrl,
          fileKey: params.descriptor.fileKey,
          nodeIdFromUrl: params.descriptor.nodeIdFromUrl,
          slug: params.targets[0]?.slug || "example-button",
        },
        requested: params.requested,
        tokens_bootstrap: params.tokenBootstrap,
        tokens_compile: params.tokenCompile,
        total_candidates: params.sourceCandidates.length,
        targets_total: params.targets.length,
        targets: params.targets,
        captured: [],
        failed: [],
        skipped: params.skipped,
        indices_refreshed: false,
      };
    },
    runCaptureBatchFn: () => ({
      captured: [{ slug: "example-button", status: "success" }],
      failed: [],
    }),
  });

  const report = await runCaptureFromFigmaUrl(
    {
      url: "https://www.figma.com/design/example-file/Components?node-id=100-200",
      "figma-token": "mock-token",
      "dry-run": "false",
      "refresh-indices": "false",
    },
    mockDeps
  );

  assert.deepEqual(report, goldenReport, "Capture report does not match golden sample");
});

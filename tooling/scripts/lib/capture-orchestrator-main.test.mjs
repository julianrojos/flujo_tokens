import assert from "node:assert/strict";
import test from "node:test";

import { runCaptureFromFigmaUrl } from "./capture-orchestrator-main.mjs";

test("capture-orchestrator-main: dry-run returns report without running capture batch", async () => {
  let captureBatchCalls = 0;
  const report = await runCaptureFromFigmaUrl(
    {
      url: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
      "figma-token": "token",
      "dry-run": "true",
    },
    {
      projectRoot: "/repo",
      resolveSystemContextSafeFn: () => ({
        id: "system",
        paths: {
          docs: "/repo/docs",
          generated: "/repo/docs/_generated",
        },
      }),
      parseFigmaFileUrlFn: () => ({
        sourceUrl: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
        fileKey: "FILE123",
        nodeIdFromUrl: "123:456",
      }),
      fetchFigmaNodesFn: async () => ({ nodes: { "123:456": { document: { type: "COMPONENT_SET", name: "Alert" } } } }),
      extractSingleNodeCandidateFn: () => ({
        node_id: "123:456",
        name: "Alert",
        kind: "component_set",
        page_name: null,
      }),
      ensureSystemDocsScaffoldFn: () => ({}),
      readComponentRegistryFn: () => [],
      buildSlugLookupFromRegistryFn: () => new Map(),
      buildSlugLookupFromSpecsFn: () => new Map(),
      buildCaptureTargetsFn: async () => ({
        targets: [
          {
            slug: "alert",
            nodeId: "123:456",
            kind: "component_set",
            pageName: null,
            markdownPath: "/repo/docs/components/alert.md",
            specPath: "/repo/docs/_spec/components/alert.yml",
            specExists: false,
            nodeUrl: "https://figma.com/node",
            specExhibits: null,
          },
        ],
        skipped: [],
      }),
      createCaptureReportFn: ({ sourceCandidates, targets }) => ({
        ok: true,
        dryRun: true,
        source: {},
        requested: {},
        tokens_bootstrap: {},
        tokens_compile: {},
        total_candidates: sourceCandidates.length,
        targets_total: targets.length,
        targets: [],
        captured: [],
        failed: [],
        skipped: [],
        indices_refreshed: false,
      }),
      executeCaptureBatchAndRefreshFn: ({ report }) => {
        captureBatchCalls += 1;
        report.captured = [];
        report.failed = [];
        report.ok = true;
        return report;
      },
    },
  );

  assert.equal(captureBatchCalls, 0);
  assert.equal(report.dryRun, true);
  assert.equal(report.targets_total, 1);
});

test("capture-orchestrator-main: non-dry run updates report with capture result", async () => {
  const report = await runCaptureFromFigmaUrl(
    {
      url: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
      "figma-token": "token",
      "dry-run": "false",
      "refresh-indices": "false",
    },
    {
      projectRoot: "/repo",
      resolveSystemContextSafeFn: () => ({
        id: "system",
        paths: {
          docs: "/repo/docs",
          generated: "/repo/docs/_generated",
        },
      }),
      parseFigmaFileUrlFn: () => ({
        sourceUrl: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
        fileKey: "FILE123",
        nodeIdFromUrl: "123:456",
      }),
      getSystemConfigFn: () => null,
      bootstrapInputJsonFromFigmaVariablesFn: async () => ({ attempted: false, created: false, reason: "system-missing" }),
      ensureCollectionsConfiguredFn: () => {},
      runTokensCompileIfNeededFn: () => ({ attempted: false, compiled: false, reason: "system-missing" }),
      fetchFigmaNodesFn: async () => ({ nodes: { "123:456": { document: { type: "COMPONENT_SET", name: "Alert" } } } }),
      extractSingleNodeCandidateFn: () => ({
        node_id: "123:456",
        name: "Alert",
        kind: "component_set",
        page_name: null,
      }),
      ensureSystemDocsScaffoldFn: () => ({}),
      readComponentRegistryFn: () => [],
      buildSlugLookupFromRegistryFn: () => new Map(),
      buildSlugLookupFromSpecsFn: () => new Map(),
      buildCaptureTargetsFn: async () => ({
        targets: [
          {
            slug: "alert",
            nodeId: "123:456",
            kind: "component_set",
            pageName: null,
            markdownPath: "/repo/docs/components/alert.md",
            specPath: "/repo/docs/_spec/components/alert.yml",
            specExists: false,
            nodeUrl: "https://figma.com/node",
            specExhibits: null,
          },
        ],
        skipped: [],
      }),
      createCaptureReportFn: () => ({
        ok: true,
        dryRun: false,
        source: {},
        requested: {},
        tokens_bootstrap: {},
        tokens_compile: {},
        total_candidates: 1,
        targets_total: 1,
        targets: [],
        captured: [],
        failed: [],
        skipped: [],
        indices_refreshed: false,
      }),
      executeCaptureBatchAndRefreshFn: ({ report }) => {
        report.captured = [{ slug: "alert" }];
        report.failed = [];
        report.ok = true;
        return report;
      },
    },
  );

  assert.equal(report.ok, true);
  assert.equal(report.captured.length, 1);
  assert.equal(report.failed.length, 0);
});

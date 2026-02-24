import assert from "node:assert/strict";
import test from "node:test";

import { finalizeSpecResult } from "./spec-finalization.mjs";

test("spec-finalization: returns stable result with indices sync", () => {
  const result = finalizeSpecResult({
    outputPath: "/tmp/alert.yml",
    normalizedSpec: {
      name: "Alert",
      token_mapping: {
        icon_color: "components/alert/icon/color",
      },
    },
    componentName: "Alert",
    nodeId: "1:1",
    prefilledCount: 1,
    validationReport: { ok: true, summary: { errors: 0, warnings: 0 } },
    resolvedSpecRoot: "/tmp/specs",
    docsRootDir: "/tmp/docs",
    overviewPath: "/tmp/docs/overview.md",
    registryIndexPath: "/tmp/docs/_generated/component-registry.json",
    syncDocumentationIndicesFn: () => ({
      changed: false,
      written: [],
      registry: {
        registryPath: "/tmp/docs/_generated/component-registry.json",
        fingerprint: "abc",
      },
      overview: {
        overviewPath: "/tmp/docs/overview.md",
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.componentName, "Alert");
  assert.equal(result.componentSetNodeId, "1:1");
  assert.equal(result.unresolvedTbdCount, 0);
  assert.equal(result.documentationIndices.registryFingerprint, "abc");
});

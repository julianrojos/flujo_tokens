import assert from "node:assert/strict";
import test from "node:test";

import { runSpecFromFigma } from "./spec-orchestrator.mjs";

test("spec-orchestrator: returns stable result with injected dependencies", () => {
  const result = runSpecFromFigma(
    {
      url: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
      "component-name": "Alert",
      output: "/tmp/alert.yml",
      template: "/tmp/_template.yml",
      registry: "/tmp/registry.json",
      "spec-root": "/tmp/specs",
      agent: "auto",
      force: "true",
    },
    {
      resolveSystemContextSafeFn: () => ({
        paths: {
          docs: "/tmp/docs",
          specs: "/tmp/specs",
          registry: "/tmp/docs/_generated/component-registry.json",
          tokenRegistry: "/tmp/docs/_generated/token-registry.json",
        },
      }),
      runSpecWithGuardsFn: ({ run }) => run({ existingSpec: null }),
      ensureSpecTemplateExistsFn: () => {},
      loadTokenRegistryFn: () => ({
        token_a: {
          path: "components.alert.icon.color",
          slashPath: "components/alert/icon/color",
          collection: "components",
          type: "color",
          resolvedValue: "#FF0000",
        },
      }),
      ensureSpecOutputDirectoryFn: () => {},
      materializeSpecAndWriteFn: () => ({
        normalizedSpec: {
          name: "Alert",
          token_mapping: { icon_color: "components/alert/icon/color" },
        },
        prefilledCount: 1,
      }),
      runSpecGenerationPromptFn: () => {},
      runSpecRepairPromptFn: () => {},
      validateGeneratedSpecFn: () => ({
        ok: true,
        report: {
          ok: true,
          summary: {
            errors: 0,
            warnings: 0,
          },
        },
        errors: [],
      }),
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
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.componentName, "Alert");
  assert.equal(result.componentSetNodeId, "123:456");
});

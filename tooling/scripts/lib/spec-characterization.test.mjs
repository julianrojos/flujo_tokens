import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runSpecFromFigma } from "./spec-orchestrator.mjs";
import { parseMarkdownFrontmatter } from "./parse-frontmatter.mjs";

import { createCaptureContextMock } from "./mock-factories.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("spec characterization: exactly matches golden YAML", async () => {
  const goldenSpecPath = path.join(__dirname, "golden-samples", "component-spec.yml");
  const goldenSpecRaw = await fs.readFile(goldenSpecPath, "utf-8");

  // We capture what gets written
  let writtenOutputPath = null;
  let writtenYamlContent = null;

  const mockDeps = createCaptureContextMock({
    loadTokenRegistryFn: () => ({
      tokens: {
        "Components/Button/Background/Primary/Default": { value: "#1C6B4A" },
      },
    }),
    captureFileSnapshotFn: () => Buffer.from("mock-snapshot"),
    restoreFileSnapshotFn: () => {},
    captureScopedWriteSnapshotFn: () => Buffer.from("mock-scoped-snapshot"),
    assertScopedWritePolicyFn: () => {},
    ensureSpecTemplateExistsFn: () => {},
    ensureSpecOutputDirectoryFn: () => {},
    materializeSpecFn: () => {
      // simulate the file writing that typical adapter would do
      writtenYamlContent = goldenSpecRaw;
      return {
        ok: true,
        normalizedSpec: parseMarkdownFrontmatter(goldenSpecRaw).content.trim(),
      };
    },
    writeSpecWithSnapshotGuardFn: ({ outputPath, applyWriteFn }) => {
       writtenOutputPath = outputPath;
       if (applyWriteFn) applyWriteFn({ outputPath });
    },
    assertEvidenceGatedScalarChangesFn: () => {},
    runSpecGenerationPromptFn: async () => ({
      message: "Here is your spec:\n```yaml\n" + goldenSpecRaw + "\n```",
    }),
    runSpecRepairPromptFn: async () => ({
      message: "```yaml\n" + goldenSpecRaw + "\n```",
    }),
    validateGeneratedSpecFn: () => ({ ok: true, errors: [] }),
    syncDocumentationIndicesFn: () => ({
      changed: true,
      written: true,
      registry: { registryPath: "/mock/repo/docs/_generated/component-registry.json", fingerprint: "abcd" },
      overview: { overviewPath: "/mock/repo/docs/overview.md" },
    }),
    formatYamlFileFn: () => {},
    runSpecWithGuardsFn: ({ run }) => run({ existingSpec: null }),
  });

  const report = await runSpecFromFigma(
    {
      url: "https://www.figma.com/design/example-file/Components?node-id=100-200",
      "component-name": "Example Button",
      system: "system",
      force: "true",
      "spec-root": "/mock/repo/docs/_spec/components",
      template: "/mock/repo/docs/_spec/components/_template.yml",
      registry: "/mock/repo/docs/_generated/token-registry.json",
    },
    mockDeps
  );

  assert.equal(report.componentName, "ExampleButton");
  assert.equal(report.componentSetNodeId, "100:200");
  assert.equal(writtenOutputPath, path.join("/mock/repo/docs/_spec/components/example_button.yml"));
  assert.equal(writtenYamlContent, goldenSpecRaw, "Spec does not match golden text");
});

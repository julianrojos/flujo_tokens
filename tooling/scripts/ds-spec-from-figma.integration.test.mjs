import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";

import { runSpecFromFigma } from "./ds-spec-from-figma.mjs";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ds-spec-from-figma-it-"));
}

test("ds-spec-from-figma integration: returns stable JSON result and writes normalized YAML", () => {
  const tmpDir = createTempDir();
  const docsComponentsDir = path.join(tmpDir, "docs", "components");
  const specsDir = path.join(tmpDir, "docs", "_spec", "components");
  const generatedDir = path.join(tmpDir, "docs", "_generated");

  fs.mkdirSync(docsComponentsDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  const outputPath = path.join(specsDir, "alert.yml");
  const templatePath = path.join(specsDir, "_template.yml");
  const registryPath = path.join(generatedDir, "token-registry.json");
  const registryIndexPath = path.join(generatedDir, "component-registry.json");

  fs.writeFileSync(
    templatePath,
    [
      "name: TBD",
      "status: draft",
      "figma:",
      "  file: TBD",
      "  page: TBD",
      "  component_set_node_id: TBD",
      "token_mapping:",
      "  icon_color: TBD",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(registryPath, "{}", "utf8");
  fs.writeFileSync(registryIndexPath, "{}", "utf8");

  const result = runSpecFromFigma(
    {
      url: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
      "component-name": "Alert",
      output: outputPath,
      template: templatePath,
      registry: registryPath,
      "spec-root": specsDir,
      agent: "auto",
    },
    {
      resolveSystemContextSafeFn: () => ({
        id: "test",
        docsDir: path.join(tmpDir, "docs"),
        paths: {
          docs: docsComponentsDir,
          specs: specsDir,
          registry: registryIndexPath,
          tokenRegistry: registryPath,
        },
      }),
      loadTokenRegistryFn: () => ({
        token_a: {
          path: "components.alert.icon.color",
          slashPath: "components/alert/icon/color",
          collection: "components",
          type: "color",
          resolvedValue: "#FF0000",
        },
      }),
      runSpecGenerationPromptFn: () => {
        fs.writeFileSync(
          outputPath,
          [
            "name: ''",
            "figma:",
            "  page: Components",
            "token_mapping:",
            "  icon_color: TBD",
            "",
          ].join("\n"),
          "utf8",
        );
      },
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
          registryPath: registryIndexPath,
          fingerprint: "test-fingerprint",
        },
        overview: {
          overviewPath: path.join(docsComponentsDir, "overview.md"),
        },
      }),
      captureScopedWriteSnapshotFn: () => ({}),
      assertScopedWritePolicyFn: () => {},
      formatYamlFileFn: () => {},
    },
  );

  assert.deepEqual(result, {
    ok: true,
    outputPath,
    componentName: "Alert",
    componentSetNodeId: "123:456",
    tokenPrefilled: 1,
    unresolvedTbdCount: 0,
    validation: {
      ok: true,
      errors: 0,
      warnings: 0,
    },
    documentationIndices: {
      changed: false,
      written: [],
      registryPath: registryIndexPath,
      registryFingerprint: "test-fingerprint",
      overviewPath: path.join(docsComponentsDir, "overview.md"),
    },
  });

  const persisted = yaml.load(fs.readFileSync(outputPath, "utf8"));
  assert.equal(persisted.name, "Alert");
  assert.equal(persisted.status, "draft");
  assert.equal(persisted.figma.file, "FILE123");
  assert.equal(persisted.figma.page, "Components");
  assert.equal(persisted.figma.component_set_node_id, "123:456");
  assert.equal(
    persisted.token_mapping.icon_color,
    "components/alert/icon/color",
  );
});

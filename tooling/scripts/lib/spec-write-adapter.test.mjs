import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";

import {
  ensureSpecTemplateExists,
  materializeAndWriteSpec,
  parseExistingSpecFromSnapshot,
} from "./spec-write-adapter.mjs";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spec-write-adapter-"));
}

test("spec-write-adapter: materializeAndWriteSpec writes normalized YAML and prefills token mappings", () => {
  const tmpDir = createTempDir();
  const templatePath = path.join(tmpDir, "_template.yml");
  const outputPath = path.join(tmpDir, "alert.yml");

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

  const { normalizedSpec, prefilledCount } = materializeAndWriteSpec({
    outputPath,
    templatePath,
    registryIndex: {
      tokenA: {
        path: "components.alert.icon.color",
        slashPath: "components/alert/icon/color",
        collection: "components",
      },
    },
    componentName: "Alert",
    nodeId: "123:456",
    fileKeyFromUrl: "FILE_KEY",
    existingSpec: null,
    allowNonEvidenceUpdates: false,
    evidenceGate: () => {},
    evidenceBackedPrefixes: ["name"],
    formatYamlFile: () => {},
  });

  assert.equal(normalizedSpec.name, "Alert");
  assert.equal(normalizedSpec.figma.file, "FILE_KEY");
  assert.equal(normalizedSpec.figma.component_set_node_id, "123:456");
  assert.equal(
    normalizedSpec.token_mapping.icon_color,
    "components/alert/icon/color",
  );
  assert.equal(prefilledCount, 1);

  const persisted = yaml.load(fs.readFileSync(outputPath, "utf8"));
  assert.equal(persisted.name, "Alert");
});

test("spec-write-adapter: calls evidence gate when existing spec is present and bypass is disabled", () => {
  const tmpDir = createTempDir();
  const templatePath = path.join(tmpDir, "_template.yml");
  const outputPath = path.join(tmpDir, "alert.yml");

  fs.writeFileSync(templatePath, "name: TBD\nfigma:\n  file: TBD\n", "utf8");
  fs.writeFileSync(outputPath, "name: Alert\nfigma:\n  page: Components\n", "utf8");

  let invoked = false;
  materializeAndWriteSpec({
    outputPath,
    templatePath,
    registryIndex: {},
    componentName: "Alert",
    nodeId: "",
    fileKeyFromUrl: "",
    existingSpec: { name: "Old Alert" },
    allowNonEvidenceUpdates: false,
    evidenceGate: () => {
      invoked = true;
    },
    evidenceBackedPrefixes: ["name"],
    formatYamlFile: () => {},
  });

  assert.equal(invoked, true);
});

test("spec-write-adapter: parseExistingSpecFromSnapshot parses snapshot content when file exists", () => {
  const parsed = parseExistingSpecFromSnapshot(
    { exists: true, content: "name: Alert\nstatus: draft\n" },
    "/tmp/alert.yml",
  );
  assert.equal(parsed.name, "Alert");
});

test("spec-write-adapter: ensureSpecTemplateExists throws for missing file", () => {
  assert.throws(
    () => ensureSpecTemplateExists("/definitely/missing/template.yml"),
    /Spec template not found/,
  );
});

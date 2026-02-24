import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecs,
  normalizeNameToSlug,
  readComponentRegistry,
  resolveInferredSlug,
} from "./capture-targets.mjs";

test("capture-targets: normalizeNameToSlug converts display names to snake_case", () => {
  assert.equal(normalizeNameToSlug("Primary Button"), "primary_button");
});

test("capture-targets: readComponentRegistry returns component array when file is valid", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-targets-"));
  const registryPath = path.join(tempDir, "component-registry.json");
  fs.writeFileSync(
    registryPath,
    JSON.stringify({ components: [{ slug: "button", figma: { component_set_node_id: "1:1" } }] }),
    "utf8",
  );

  const rows = readComponentRegistry(registryPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "button");
});

test("capture-targets: buildSlugLookupFromRegistry maps node ids to slugs", () => {
  const lookup = buildSlugLookupFromRegistry([
    { slug: "button", figma: { component_set_node_id: "1:1" } },
    { slug: "alert", figma: { component_set_node_id: "2:2" } },
  ]);

  assert.equal(lookup.get("1:1"), "button");
  assert.equal(lookup.get("2:2"), "alert");
});

test("capture-targets: buildSlugLookupFromSpecs reads component_set_node_id from YAML", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-specs-"));
  fs.writeFileSync(
    path.join(tempDir, "button.yml"),
    "name: Button\nfigma:\n  component_set_node_id: 10:20\n",
    "utf8",
  );

  const lookup = buildSlugLookupFromSpecs(tempDir);
  assert.equal(lookup.get("10:20"), "button");
});

test("capture-targets: resolveInferredSlug uses deterministic priority", () => {
  const slugByRegistry = new Map([["1:1", "button"]]);
  const slugBySpecs = new Map([["1:1", "button_from_spec"], ["2:2", "alert"]]);

  const fromOverride = resolveInferredSlug({
    applySlugOverride: true,
    componentSlugOverride: "override_slug",
    slugByNodeFromRegistry: slugByRegistry,
    slugByNodeFromSpecs: slugBySpecs,
    nodeId: "1:1",
    candidateName: "Primary Button",
  });
  assert.equal(fromOverride, "override_slug");

  const fromRegistry = resolveInferredSlug({
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: slugByRegistry,
    slugByNodeFromSpecs: slugBySpecs,
    nodeId: "1:1",
    candidateName: "Primary Button",
  });
  assert.equal(fromRegistry, "button");

  const fromSpecs = resolveInferredSlug({
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: new Map(),
    slugByNodeFromSpecs: slugBySpecs,
    nodeId: "2:2",
    candidateName: "Alert Box",
  });
  assert.equal(fromSpecs, "alert");

  const fromName = resolveInferredSlug({
    applySlugOverride: false,
    componentSlugOverride: "",
    slugByNodeFromRegistry: new Map(),
    slugByNodeFromSpecs: new Map(),
    nodeId: "3:3",
    candidateName: "Primary Button",
  });
  assert.equal(fromName, "primary_button");
});

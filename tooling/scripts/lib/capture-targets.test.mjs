import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecContents,
  normalizeNameToSlug,
  resolveInferredSlug,
} from "./capture-targets.mjs";

test("capture-targets: normalizeNameToSlug converts display names to snake_case", () => {
  assert.equal(normalizeNameToSlug("Primary Button"), "primary_button");
});

test("capture-targets: buildSlugLookupFromRegistry maps node ids to slugs ignores invalid", () => {
  const lookup = buildSlugLookupFromRegistry([
    { slug: "button", figma: { component_set_node_id: "1:1" } },
    { slug: "alert", figma: { component_set_node_id: "2:2" } },
    null,
    {},
  ]);

  assert.equal(lookup.get("1:1"), "button");
  assert.equal(lookup.get("2:2"), "alert");
  assert.equal(lookup.size, 2);
});

test("capture-targets: buildSlugLookupFromSpecContents reads component_set_node_id from YAML content array", () => {
  const lookup = buildSlugLookupFromSpecContents([
    {
      slug: "button",
      content: "name: Button\nfigma:\n  component_set_node_id: 10:20\n",
    },
    {
      slug: "alert",
      content: "name: Alert\nfigma:\n  component_set_node_id: '30:40'\n",
    }
  ]);
  assert.equal(lookup.get("10:20"), "button");
  assert.equal(lookup.get("30:40"), "alert");
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

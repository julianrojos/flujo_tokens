import test from "node:test";
import assert from "node:assert/strict";

import {
  SPEC_TOP_LEVEL_ORDER,
  mergeWithTemplate,
  normalizeSpecOrder,
} from "./spec-normalizer.mjs";

test("spec-normalizer: mergeWithTemplate preserves template defaults and generated overrides", () => {
  const template = {
    name: "TBD",
    figma: {
      file: "TBD",
      page: "TBD",
    },
    properties: [],
    nested: {
      required: true,
      fallback: "TBD",
    },
  };
  const generated = {
    name: "Alert",
    figma: {
      component_set_node_id: "123:456",
    },
    nested: {
      fallback: "ok",
      extra: "keep-me",
    },
    extra_root: 42,
  };

  const merged = mergeWithTemplate(template, generated);

  assert.deepEqual(merged, {
    name: "Alert",
    figma: {
      file: "TBD",
      page: "TBD",
      component_set_node_id: "123:456",
    },
    properties: [],
    nested: {
      required: true,
      fallback: "ok",
      extra: "keep-me",
    },
    extra_root: 42,
  });
});

test("spec-normalizer: normalizeSpecOrder applies canonical top-level and figma key order", () => {
  const input = {
    token_mapping: {},
    summary: "TBD",
    figma: {
      component_set_node_id: "123:456",
      page: "Components",
      file: "abc",
      custom: "keep-me",
    },
    status: "draft",
    name: "Alert",
    custom_root: "x",
  };

  const normalized = normalizeSpecOrder(input);
  const keys = Object.keys(normalized);
  const expectedPrefix = SPEC_TOP_LEVEL_ORDER.filter((key) => key in normalized);
  assert.deepEqual(keys.slice(0, expectedPrefix.length), expectedPrefix);
  assert.deepEqual(Object.keys(normalized.figma), [
    "file",
    "page",
    "component_set_node_id",
    "custom",
  ]);
});

test("spec-normalizer: normalizeSpecOrder sorts properties by ordering group and canonical field order", () => {
  const input = {
    properties: [
      {
        required: true,
        description: "boolean prop",
        name: "enabled",
        type: "BOOLEAN",
      },
      {
        values: ["sm", "md"],
        name: "size",
        default: "sm",
        type: "variant",
        required: true,
        note: "keep-extra",
      },
      {
        type: "TEXT",
        description: "label prop",
        name: "label",
      },
    ],
  };

  const normalized = normalizeSpecOrder(input);
  const names = normalized.properties.map((item) => item.name);
  assert.deepEqual(names, ["size", "label", "enabled"]);

  assert.deepEqual(Object.keys(normalized.properties[0]), [
    "name",
    "type",
    "values",
    "default",
    "required",
    "note",
  ]);
  assert.equal(normalized.properties[0].type, "enum");
});

test("spec-normalizer: normalizeSpecOrder is idempotent", () => {
  const input = {
    name: "Alert",
    figma: { page: "Components", file: "abc", component_set: "Alert" },
    properties: [
      { type: "TEXT", name: "label", description: "Label text" },
      { type: "variant", name: "size", values: ["sm", "md"], default: "sm" },
    ],
  };

  const once = normalizeSpecOrder(input);
  const twice = normalizeSpecOrder(once);
  assert.deepEqual(twice, once);
});

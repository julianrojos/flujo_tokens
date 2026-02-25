import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTokenMenuLines,
  extractUniqueRegistryEntries,
  pickBestTokenPath,
  pickComponentTokenCandidates,
  prefillTokenMapping,
} from "./spec-token-mapping.mjs";

test("spec-token-mapping: extractUniqueRegistryEntries deduplicates by stable marker", () => {
  const entries = {
    a: { path: "components.alert.icon.color", slashPath: "components/alert/icon/color", collection: "components" },
    b: { path: "components.alert.icon.color", slashPath: "components/alert/icon/color", collection: "components" },
    c: { path: "semantic.surface.default", slashPath: "semantic/surface/default", collection: "semantic" },
  };

  const unique = extractUniqueRegistryEntries(entries);
  assert.equal(unique.length, 2);
});

test("spec-token-mapping: pickComponentTokenCandidates filters components collection by normalized component name", () => {
  const registryEntries = [
    { path: "components.alert.icon.color", slashPath: "components/alert/icon/color", collection: "components" },
    { path: "components.button.icon.color", slashPath: "components/button/icon/color", collection: "components" },
    { path: "semantic.surface.default", slashPath: "semantic/surface/default", collection: "semantic" },
  ];

  const matches = pickComponentTokenCandidates(registryEntries, "Alert");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].path, "components.alert.icon.color");
});

test("spec-token-mapping: buildTokenMenuLines prefers component candidates and formats resolved values", () => {
  const registryEntries = [
    {
      path: "components.alert.icon.color",
      slashPath: "components/alert/icon/color",
      collection: "components",
      type: "color",
      resolvedValue: "#FF0000",
    },
    {
      path: "semantic.surface.default",
      slashPath: "semantic/surface/default",
      collection: "semantic",
      type: "color",
      resolvedValue: "#FFFFFF",
    },
  ];

  const lines = buildTokenMenuLines(registryEntries, "Alert");
  assert.deepEqual(lines, ["components/alert/icon/color (color: #FF0000)"]);
});

test("spec-token-mapping: pickBestTokenPath requires strong or unique match", () => {
  const candidates = [
    { path: "components.alert.background.default", slashPath: "components/alert/background/default" },
    { path: "components.alert.border.default", slashPath: "components/alert/border/default" },
  ];

  assert.equal(
    pickBestTokenPath(candidates, "token_mapping.background", "default"),
    "components/alert/background/default",
  );
  assert.equal(
    pickBestTokenPath(candidates, "token_mapping.unknown", "default"),
    "",
  );
});

test("spec-token-mapping: prefillTokenMapping fills TBD values recursively", () => {
  const mapping = {
    color_default: "TBD",
    nested: {
      icon_path: "TBD",
    },
  };
  const candidates = [
    { path: "components.alert.color.default", slashPath: "components/alert/color/default" },
    { path: "components.alert.icon.path", slashPath: "components/alert/icon/path" },
  ];

  const filled = prefillTokenMapping(mapping, candidates, "token_mapping");
  assert.equal(filled, 2);
  assert.equal(mapping.color_default, "components/alert/color/default");
  assert.equal(mapping.nested.icon_path, "components/alert/icon/path");
});

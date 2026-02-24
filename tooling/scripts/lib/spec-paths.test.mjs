import test from "node:test";
import assert from "node:assert/strict";

import { buildSpecOutputPath } from "./spec-paths.mjs";

test("spec-paths: explicit output wins over inferred output", () => {
  const output = buildSpecOutputPath(
    { output: "docs/_spec/components/custom.yml" },
    "docs/_spec/components",
    "alert",
    "1:2",
  );
  assert.match(output, /custom\.yml$/);
});

test("spec-paths: component slug creates deterministic yml path", () => {
  const output = buildSpecOutputPath(
    {},
    "docs/_spec/components",
    "alert_banner",
    "",
  );
  assert.match(output, /alert_banner\.yml$/);
});

test("spec-paths: fallback uses node id when slug is not available", () => {
  const output = buildSpecOutputPath({}, "docs/_spec/components", "", "12:34");
  assert.match(output, /component_12_34\.yml$/);
});

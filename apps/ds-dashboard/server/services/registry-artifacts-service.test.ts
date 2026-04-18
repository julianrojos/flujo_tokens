import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildComponentUsageIndex } from "./registry-artifacts-service.mjs";

test("buildComponentUsageIndex keeps db:// usage graph empty without spec relationships", () => {
  const index = buildComponentUsageIndex(
    [
      {
        slug: "button",
        paths: { spec: "db://component_editorial/1" },
      },
      { slug: "icon", paths: { spec: "db://component_editorial/2" } },
    ],
    "/repo",
  );

  assert.deepEqual(index.by_slug.button.uses, []);
  assert.deepEqual(index.by_slug.icon.used_in, []);
});

test("buildComponentUsageIndex keeps empty graph when db:// row has no relations", () => {
  const index = buildComponentUsageIndex(
    [
      { slug: "alpha", paths: { spec: "db://component_editorial/11" } },
      { slug: "beta", paths: { spec: "db://component_editorial/12" } },
    ],
    "/repo",
  );

  assert.deepEqual(index.by_slug.alpha.uses, []);
  assert.deepEqual(index.by_slug.alpha.used_in, []);
  assert.deepEqual(index.by_slug.beta.uses, []);
  assert.deepEqual(index.by_slug.beta.used_in, []);
});

test("buildComponentUsageIndex resolves anatomy component_ref relations from component specs", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "usage-index-"));
  try {
    const specPath = path.join(
      tmpRoot,
      "design-systems",
      "sys-01",
      "docs",
      "_spec",
      "components",
      "button.yml",
    );

    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(
      specPath,
      [
        "name: button",
        "status: draft",
        "anatomy:",
        "  - id: icon_item",
        "    component_ref: icon",
        "",
      ].join("\n"),
      "utf8",
    );

    const index = buildComponentUsageIndex(
      [
        { slug: "button", paths: { spec: "design-systems/sys-01/docs/_spec/components/button.yml" } },
        { slug: "icon", paths: { spec: "design-systems/sys-01/docs/_spec/components/icon.yml" } },
      ],
      tmpRoot,
    );

    assert.deepEqual(index.by_slug.button.uses, ["icon"]);
    assert.deepEqual(index.by_slug.icon.used_in, ["button"]);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

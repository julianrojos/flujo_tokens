import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentUsageIndex } from "./registry-artifacts-service.mjs";

test("buildComponentUsageIndex resolves db:// relations from related_components and anatomy", () => {
  const index = buildComponentUsageIndex(
    [
      {
        slug: "button",
        paths: { spec: "db://component_editorial/1" },
        related_components: ["icon"],
        anatomy: [{ id: "list_items" }],
      },
      { slug: "icon", paths: { spec: "db://component_editorial/2" } },
      { slug: "list_item", paths: { spec: "db://component_editorial/3" } },
    ],
    "/repo",
  );

  assert.deepEqual(index.by_slug.button.uses, ["icon", "list_item"]);
  assert.deepEqual(index.by_slug.icon.used_in, ["button"]);
  assert.deepEqual(index.by_slug.list_item.used_in, ["button"]);
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

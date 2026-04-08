import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentUsageIndex } from "./registry-artifacts-service.mjs";

test("buildComponentUsageIndex resolves db:// relations from related_components", () => {
  const index = buildComponentUsageIndex(
    [
      {
        slug: "button",
        paths: { spec: "db://component_editorial/1" },
        related_components: ["icon"],
      },
      { slug: "icon", paths: { spec: "db://component_editorial/2" } },
    ],
    "/repo",
  );

  assert.deepEqual(index.by_slug.button.uses, ["icon"]);
  assert.deepEqual(index.by_slug.icon.used_in, ["button"]);
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

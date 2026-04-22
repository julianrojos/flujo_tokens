import assert from "node:assert/strict";
import test from "node:test";

import { buildComponentUsageIndex } from "./registry-artifacts-service.mjs";

test("buildComponentUsageIndex keeps usage graph empty without figma relations", () => {
  const index = buildComponentUsageIndex([{ slug: "button" }, { slug: "icon" }]);

  assert.deepEqual(index.by_slug.button.uses, []);
  assert.deepEqual(index.by_slug.icon.used_in, []);
});

test("buildComponentUsageIndex keeps empty graph when rows have no relations", () => {
  const index = buildComponentUsageIndex([{ slug: "alpha" }, { slug: "beta" }]);

  assert.deepEqual(index.by_slug.alpha.uses, []);
  assert.deepEqual(index.by_slug.alpha.used_in, []);
  assert.deepEqual(index.by_slug.beta.uses, []);
  assert.deepEqual(index.by_slug.beta.used_in, []);
});

test("buildComponentUsageIndex resolves figma instance dependencies from captured data", () => {
  const index = buildComponentUsageIndex(
    [
      {
        slug: "calendar",
        figma: {
          componentSetNodeId: "4333:9262",
          variants: [
            { name: "Default", properties: {}, nodeId: "4333:9286" },
          ],
          instanceDependencies: [
            {
              instanceNodeId: "4333:9999",
              instanceNodeName: "Calendar Select Group",
              usedComponentNodeId: "4333:9286",
              usedComponentName: "Calendar Button",
              status: "resolved",
            },
          ],
        },
      },
      {
        slug: "calendar-button",
        figma: {
          componentSetNodeId: "4333:9286",
          variants: [
            { name: "Default", properties: {}, nodeId: "4333:9287" },
          ],
        },
      },
    ],
  );

  assert.deepEqual(index.by_slug.calendar.uses, ["calendar-button"]);
  assert.deepEqual(index.by_slug["calendar-button"].used_in, ["calendar"]);
});

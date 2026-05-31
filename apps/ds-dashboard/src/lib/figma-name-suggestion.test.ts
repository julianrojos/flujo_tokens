import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { suggestNameFromFigmaUrl } from "./figma-name-suggestion";

describe("figma-name-suggestion", () => {
  it("suggests a readable name from a Figma file URL slug", () => {
    assert.equal(
      suggestNameFromFigmaUrl("https://www.figma.com/file/ABC123/marketing-site-redesign?node-id=0-1"),
      "Marketing Site Redesign",
    );
  });

  it("supports design URLs and URLs without slugs", () => {
    assert.equal(
      suggestNameFromFigmaUrl("https://www.figma.com/design/ABC123/admin-dashboard-v2"),
      "Admin Dashboard V2",
    );
    assert.equal(
      suggestNameFromFigmaUrl("https://www.figma.com/file/ABC123"),
      "",
    );
  });
});

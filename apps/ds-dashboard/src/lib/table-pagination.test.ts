import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldAllowShowAll, shouldShowPageSizeSelect } from "./table-pagination";

describe("table pagination helpers", () => {
  it("hides page size controls for small tables", () => {
    assert.equal(shouldShowPageSizeSelect(25), false);
    assert.equal(shouldShowPageSizeSelect(26), true);
  });

  it("shows All only for partial 25-row blocks below the upper bound", () => {
    assert.equal(shouldAllowShowAll(25), false);
    assert.equal(shouldAllowShowAll(50), false);
    assert.equal(shouldAllowShowAll(59), false);
    assert.equal(shouldAllowShowAll(75), false);
    assert.equal(shouldAllowShowAll(175), false);
    assert.equal(shouldAllowShowAll(176), true);
    assert.equal(shouldAllowShowAll(200), true);
  });
});

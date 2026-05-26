import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getTablePageSizeOptions,
  resolveTablePaginationWindow,
  shouldAllowShowAll,
  shouldShowPageSizeSelect,
} from "./table-pagination";

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

  it("resolves page size options and page windows consistently", () => {
    assert.deepEqual(getTablePageSizeOptions(24), [25]);
    assert.deepEqual(getTablePageSizeOptions(25), [25]);
    assert.deepEqual(getTablePageSizeOptions(50), [25, 50]);

    assert.deepEqual(resolveTablePaginationWindow(50, "25", 2), {
      pageSizeValue: 25,
      shouldPaginate: true,
      totalPages: 2,
      pageStart: 26,
      pageEnd: 50,
    });
    assert.deepEqual(resolveTablePaginationWindow(8, "all", 1), {
      pageSizeValue: 8,
      shouldPaginate: false,
      totalPages: 1,
      pageStart: 1,
      pageEnd: 8,
    });
    assert.deepEqual(resolveTablePaginationWindow(0, "25", 1), {
      pageSizeValue: 25,
      shouldPaginate: false,
      totalPages: 1,
      pageStart: 0,
      pageEnd: 0,
    });
  });
});

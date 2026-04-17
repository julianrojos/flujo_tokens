import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatImportSuccessNotice } from "../new-system-import-summary";

describe("formatImportSuccessNotice", () => {
  it("shows imported counts when totals are unavailable", () => {
    const notice = formatImportSuccessNotice({
      elementsImported: 12,
      elementsTotal: 24,
      collectionsImported: null,
      collectionsTotal: null,
      variablesImported: 48,
      variablesTotal: null,
      tokensCompiled: null,
      compileReason: null,
    });

    assert.equal(notice.elementsLine, "Components: 12 imported out of 24 detected.");
    assert.equal(notice.collectionsLine, "Collections: n/a (token bootstrap not attempted).");
    assert.equal(notice.variablesLine, "Variables: 48 imported.");
  });

  it("marks detected component total as lower bound when scan was truncated", () => {
    const notice = formatImportSuccessNotice({
      elementsImported: 120,
      elementsTotal: 500,
      elementsTotalIsLowerBound: true,
      collectionsImported: null,
      collectionsTotal: null,
      variablesImported: null,
      variablesTotal: null,
      tokensCompiled: null,
      compileReason: null,
    });

    assert.equal(notice.elementsLine, "Components: 120 imported out of at least 500 detected.");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImportSuccessNotice } from "../src/features/system/import-success-notice.js";
import {
  buildImportSuccessSummary,
  formatImportSuccessNotice,
} from "../src/features/system/new-system-import-summary.js";

describe("new-system import success summary", () => {
  it("builds summary using tokens_total when available", () => {
    const summary = buildImportSuccessSummary({
      targets_total: 12,
      captured: new Array(9).fill(null),
      targets: [],
      tokens_bootstrap: {
        attempted: true,
        collections: ["Primitives", "Semantic"],
        tokens_written: 80,
        tokens_total: 100,
      },
    });

    assert.deepEqual(summary, {
      elementsImported: 9,
      elementsTotal: 12,
      collectionsImported: 2,
      collectionsTotal: 2,
      variablesImported: 80,
      variablesTotal: 100,
    });
  });

  it("formats success lines with exact copy", () => {
    const notice = formatImportSuccessNotice({
      elementsImported: 9,
      elementsTotal: 12,
      collectionsImported: 2,
      collectionsTotal: 3,
      variablesImported: 80,
      variablesTotal: 100,
    });

    assert.equal(
      notice.elementsLine,
      "Components: 9 imported out of 12 detected.",
    );
    assert.equal(
      notice.collectionsLine,
      "Collections: 2 downloaded out of 3 detected.",
    );
    assert.equal(
      notice.variablesLine,
      "Variables: 80 downloaded out of 100 detected.",
    );
    assert.equal(
      notice.customPropertiesLine,
      "Custom properties: n/a (compile step removed).",
    );
  });

  it("formats collections and variables as n/a when token bootstrap was not attempted", () => {
    const summary = buildImportSuccessSummary({
      targets_total: 2,
      captured: new Array(2).fill(null),
      targets: [],
      tokens_bootstrap: {
        attempted: false,
      },
    });

    assert.deepEqual(summary, {
      elementsImported: 2,
      elementsTotal: 2,
      collectionsImported: null,
      collectionsTotal: null,
      variablesImported: null,
      variablesTotal: null,
    });

    const notice = formatImportSuccessNotice(summary);
    assert.equal(
      notice.collectionsLine,
      "Collections: n/a (token bootstrap not attempted).",
    );
    assert.equal(
      notice.variablesLine,
      "Variables: n/a (token bootstrap not attempted).",
    );
    assert.equal(
      notice.customPropertiesLine,
      "Custom properties: n/a (compile step removed).",
    );
  });

  it("renders exact success copy in notice UI", () => {
    const html = renderToStaticMarkup(
      createElement(ImportSuccessNotice, {
        summary: {
          elementsImported: 9,
          elementsTotal: 12,
          collectionsImported: 2,
          collectionsTotal: 3,
          variablesImported: 80,
          variablesTotal: 100,
        },
      }),
    );

    assert.match(
      html,
      /Design system successfully imported\./,
    );
    assert.match(html, /Components: 9 imported out of 12 detected\./);
    assert.match(html, /Collections: 2 downloaded out of 3 detected\./);
    assert.match(html, /Variables: 80 downloaded out of 100 detected\./);
    assert.match(html, /Custom properties: n\/a \(compile step removed\)\./);
  });
});

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
        tokens_written: 80,
        tokens_total: 100,
      },
    });

    assert.deepEqual(summary, {
      elementsImported: 9,
      elementsTotal: 12,
      variablesImported: 80,
      variablesTotal: 100,
    });
  });

  it("falls back to targets length and tokens_written when totals are missing", () => {
    const summary = buildImportSuccessSummary({
      targets: [
        { slug: "one", node_id: "1", markdown_path: "docs/components/one.md" },
        { slug: "two", node_id: "2", markdown_path: "docs/components/two.md" },
        { slug: "three", node_id: "3", markdown_path: "docs/components/three.md" },
      ],
      captured: [{ slug: "one", node_id: "1", markdown_path: "docs/components/one.md" }],
      tokens_bootstrap: {
        tokens_written: 5,
      },
    });

    assert.deepEqual(summary, {
      elementsImported: 1,
      elementsTotal: 3,
      variablesImported: 5,
      variablesTotal: 5,
    });
  });

  it("formats success lines with exact copy", () => {
    const notice = formatImportSuccessNotice({
      elementsImported: 9,
      elementsTotal: 12,
      variablesImported: 80,
      variablesTotal: 100,
    });

    assert.equal(
      notice.elementsLine,
      "Design system successfully imported: 9 elements out of 12 total elements imported.",
    );
    assert.equal(
      notice.variablesLine,
      "80 variables out of 100 total variables imported.",
    );
  });

  it("renders exact success copy in notice UI", () => {
    const html = renderToStaticMarkup(
      createElement(ImportSuccessNotice, {
        summary: {
          elementsImported: 9,
          elementsTotal: 12,
          variablesImported: 80,
          variablesTotal: 100,
        },
      }),
    );

    assert.match(
      html,
      /Design system successfully imported: 9 elements out of 12 total elements imported\./,
    );
    assert.match(html, /80 variables out of 100 total variables imported\./);
  });
});

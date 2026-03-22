/**
 * Tests for token-diff-filter-query pure functions
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readTokenDiffFilterState,
  writeSearch,
  writeBreaking,
  writeBeforeRef,
  buildTokenDiffQueryString,
} from "./token-diff-filter-query";

describe("readTokenDiffFilterState", () => {
  it("reads default state from empty params", () => {
    const params = new URLSearchParams();
    const state = readTokenDiffFilterState(params);

    assert.equal(state.search, "");
    assert.equal(state.showOnlyBreaking, false);
    assert.equal(state.beforeRef, "HEAD~1");
  });

  it("reads search from q param", () => {
    const params = new URLSearchParams("q=color");
    const state = readTokenDiffFilterState(params);

    assert.equal(state.search, "color");
  });

  it("reads showOnlyBreaking from breaking param", () => {
    const params = new URLSearchParams("breaking=true");
    const state = readTokenDiffFilterState(params);

    assert.equal(state.showOnlyBreaking, true);
  });

  it("reads beforeRef from ref param", () => {
    const params = new URLSearchParams("ref=HEAD~5");
    const state = readTokenDiffFilterState(params);

    assert.equal(state.beforeRef, "HEAD~5");
  });

  it("reads all params together", () => {
    const params = new URLSearchParams("q=color&breaking=true&ref=main");
    const state = readTokenDiffFilterState(params);

    assert.equal(state.search, "color");
    assert.equal(state.showOnlyBreaking, true);
    assert.equal(state.beforeRef, "main");
  });
});

describe("writeSearch", () => {
  it("sets q param for non-empty search", () => {
    const params = new URLSearchParams();
    const result = writeSearch(params, "color");

    assert.equal(result.get("q"), "color");
  });

  it("deletes q param for empty search", () => {
    const params = new URLSearchParams("q=color");
    const result = writeSearch(params, "");

    assert.equal(result.get("q"), null);
  });

  it("deletes q param for default search", () => {
    const params = new URLSearchParams("q=color");
    const result = writeSearch(params, "");

    assert.equal(result.has("q"), false);
  });
});

describe("writeBreaking", () => {
  it("sets breaking=true for true value", () => {
    const params = new URLSearchParams();
    const result = writeBreaking(params, true);

    assert.equal(result.get("breaking"), "true");
  });

  it("deletes breaking param for false value", () => {
    const params = new URLSearchParams("breaking=true");
    const result = writeBreaking(params, false);

    assert.equal(result.get("breaking"), null);
  });
});

describe("writeBeforeRef", () => {
  it("sets ref param for non-default value", () => {
    const params = new URLSearchParams();
    const result = writeBeforeRef(params, "HEAD~5");

    assert.equal(result.get("ref"), "HEAD~5");
  });

  it("deletes ref param for default value", () => {
    const params = new URLSearchParams("ref=HEAD~5");
    const result = writeBeforeRef(params, "HEAD~1");

    assert.equal(result.get("ref"), null);
  });

  it("deletes ref param for empty value", () => {
    const params = new URLSearchParams("ref=HEAD~5");
    const result = writeBeforeRef(params, "");

    assert.equal(result.get("ref"), null);
  });
});

describe("buildTokenDiffQueryString", () => {
  it("builds empty string for default state", () => {
    const result = buildTokenDiffQueryString({});

    assert.equal(result, "");
  });

  it("builds query string with search", () => {
    const result = buildTokenDiffQueryString({ search: "color" });

    assert.equal(result, "?q=color");
  });

  it("builds query string with breaking", () => {
    const result = buildTokenDiffQueryString({ showOnlyBreaking: true });

    assert.equal(result, "?breaking=true");
  });

  it("builds query string with ref", () => {
    const result = buildTokenDiffQueryString({ beforeRef: "HEAD~5" });

    // URLSearchParams encodes ~ to %7E
    assert.equal(result, "?ref=HEAD%7E5");
  });

  it("builds query string with all params", () => {
    const result = buildTokenDiffQueryString({
      search: "color",
      showOnlyBreaking: true,
      beforeRef: "main",
    });

    assert.ok(result.includes("q=color"));
    assert.ok(result.includes("breaking=true"));
    assert.ok(result.includes("ref=main"));
  });
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readConsumerFilterState,
  writeSearchQuery,
} from "../lib/consumer-filter-query";

describe("consumer-filter-query", () => {
  it("reads search query from URL params", () => {
    const params = new URLSearchParams("q=button");
    const state = readConsumerFilterState(params);

    assert.equal(state.searchQuery, "button");
  });

  it("falls back to empty string when q param is absent", () => {
    const params = new URLSearchParams("");
    const state = readConsumerFilterState(params);

    assert.equal(state.searchQuery, "");
  });

  it("writes params while preserving unrelated keys", () => {
    const initial = new URLSearchParams("page=2");
    const afterSearch = writeSearchQuery(initial, "color");

    assert.equal(afterSearch.get("page"), "2");
    assert.equal(afterSearch.get("q"), "color");
  });

  it("removes q param when value is empty", () => {
    const initial = new URLSearchParams("q=button");
    const result = writeSearchQuery(initial, "");

    assert.equal(result.has("q"), false);
  });
});

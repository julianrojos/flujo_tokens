import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
} from "../lib/consumer-filter-query";

describe("consumer-filter-query", () => {
  it("reads URL params into filter state", () => {
    const params = new URLSearchParams("q=button&severity=HIGH");
    const state = readConsumerFilterState(params);

    assert.equal(state.searchQuery, "button");
    assert.equal(state.severityFilter, "HIGH");
  });

  it("falls back to all when severity query param is invalid", () => {
    const params = new URLSearchParams("severity=SEVERE");
    const state = readConsumerFilterState(params);

    assert.equal(state.severityFilter, "all");
  });

  it("writes params while preserving unrelated keys", () => {
    const initial = new URLSearchParams("tab=by-variable&page=2");
    const afterSearch = writeSearchQuery(initial, "color");
    const afterSeverity = writeSeverityFilter(afterSearch, "CRITICAL");

    assert.equal(afterSeverity.get("tab"), "by-variable");
    assert.equal(afterSeverity.get("page"), "2");
    assert.equal(afterSeverity.get("q"), "color");
    assert.equal(afterSeverity.get("severity"), "CRITICAL");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
  writeStatusFilter,
} from "../lib/consumer-filter-query";

describe("consumer-filter-query", () => {
  it("reads URL params into filter state", () => {
    const params = new URLSearchParams("q=button&severity=HIGH&status=partial");
    const state = readConsumerFilterState(params);

    assert.equal(state.searchQuery, "button");
    assert.equal(state.severityFilter, "HIGH");
    assert.equal(state.statusFilter, "partial");
  });

  it("falls back to all when status query param is invalid", () => {
    const params = new URLSearchParams("status=garbage");
    const state = readConsumerFilterState(params);

    assert.equal(state.statusFilter, "all");
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
    const afterStatus = writeStatusFilter(afterSeverity, "error");

    assert.equal(afterStatus.get("tab"), "by-variable");
    assert.equal(afterStatus.get("page"), "2");
    assert.equal(afterStatus.get("q"), "color");
    assert.equal(afterStatus.get("severity"), "CRITICAL");
    assert.equal(afterStatus.get("status"), "error");
  });
});

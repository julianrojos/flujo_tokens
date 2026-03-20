import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readConsumerFilterState,
  writeSearchQuery,
  writeSeverityFilter,
  writeStaleFilter,
} from "../lib/consumer-filter-query";

describe("consumer-filter-query", () => {
  it("reads URL params into filter state", () => {
    const params = new URLSearchParams("q=button&severity=HIGH&stale=true");
    const state = readConsumerFilterState(params);

    assert.equal(state.searchQuery, "button");
    assert.equal(state.severityFilter, "HIGH");
    assert.equal(state.staleFilter, true);
  });

  it("writes params while preserving unrelated keys", () => {
    const initial = new URLSearchParams("tab=by-variable&page=2");
    const afterSearch = writeSearchQuery(initial, "color");
    const afterSeverity = writeSeverityFilter(afterSearch, "CRITICAL");
    const afterStale = writeStaleFilter(afterSeverity, true);

    assert.equal(afterStale.get("tab"), "by-variable");
    assert.equal(afterStale.get("page"), "2");
    assert.equal(afterStale.get("q"), "color");
    assert.equal(afterStale.get("severity"), "CRITICAL");
    assert.equal(afterStale.get("stale"), "true");
  });
});


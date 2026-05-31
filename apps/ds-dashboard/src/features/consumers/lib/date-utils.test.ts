import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSyncedAt } from "./date-utils";

describe("date-utils", () => {
  it("returns the fallback for empty and invalid values", () => {
    assert.equal(parseSyncedAt(undefined, null), null);
    assert.equal(parseSyncedAt(null, null), null);
    assert.equal(parseSyncedAt("", null), null);
    assert.equal(parseSyncedAt("not-a-date", Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
  });

  it("parses valid ISO timestamps", () => {
    assert.equal(
      parseSyncedAt("2026-05-27T10:15:30.000Z", null),
      Date.parse("2026-05-27T10:15:30.000Z"),
    );
  });
});

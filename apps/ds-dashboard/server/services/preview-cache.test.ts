import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPreviewCache } from "./preview-cache.ts";

describe("createPreviewCache", () => {
  it("refreshes recency on get and evicts by size and system", () => {
    let now = 0;
    const cache = createPreviewCache<string>({
      ttlMs: 100,
      maxEntries: 2,
      now: () => now,
    });

    cache.set("a", "system-a", "A");
    now += 10;
    cache.set("b", "system-b", "B");
    now += 10;
    assert.equal(cache.get("a"), "A");

    now += 10;
    cache.set("c", "system-c", "C");
    assert.equal(cache.get("b"), null);
    assert.equal(cache.get("a"), "A");
    assert.equal(cache.get("c"), "C");

    cache.clearForSystem("system-a");
    assert.equal(cache.get("a"), null);
    assert.equal(cache.get("c"), "C");
  });

  it("expires entries after the TTL", () => {
    let now = 0;
    const cache = createPreviewCache<number>({
      ttlMs: 50,
      maxEntries: 10,
      now: () => now,
    });

    cache.set("key", "system", 123);
    now = 51;
    assert.equal(cache.get("key"), null);
  });
});

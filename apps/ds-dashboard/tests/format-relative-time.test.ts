import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRelativeTime } from "../src/lib/format-relative-time";

describe("formatRelativeTime", () => {
  it("returns Spanish fallback by default when value is invalid", () => {
    assert.equal(formatRelativeTime(undefined), "Nunca");
    assert.equal(formatRelativeTime("not-a-date"), "Nunca");
  });

  it("returns English fallback when locale is en and value is invalid", () => {
    assert.equal(formatRelativeTime(undefined, { locale: "en" }), "Never");
  });

  it("formats past seconds in Spanish by default", () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.equal(formatRelativeTime(1_699_999_995_000), "hace 5s");
    } finally {
      Date.now = originalNow;
    }
  });

  it("formats future seconds in Spanish by default", () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.equal(formatRelativeTime(1_700_000_005_000), "en 5s");
    } finally {
      Date.now = originalNow;
    }
  });

  it("formats English compact elapsed text for timeline usage", () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.equal(
        formatRelativeTime(1_699_999_940_000, { locale: "en" }),
        "1m ago",
      );
    } finally {
      Date.now = originalNow;
    }
  });

  it("formats English stale values older than 24h as days", () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.equal(
        formatRelativeTime(1_699_740_800_000, { locale: "en" }),
        "3d ago",
      );
    } finally {
      Date.now = originalNow;
    }
  });

  it("handles Unix epoch boundary timestamp (0) deterministically", () => {
    const originalNow = Date.now;
    Date.now = () => 0;
    try {
      assert.equal(formatRelativeTime(0, { locale: "en" }), "0s ago");
    } finally {
      Date.now = originalNow;
    }
  });

  it("formats very large future timestamps in English using days", () => {
    const originalNow = Date.now;
    Date.now = () => 0;
    try {
      assert.equal(
        formatRelativeTime(86_400_000 * 400, { locale: "en" }),
        "in 400d",
      );
    } finally {
      Date.now = originalNow;
    }
  });

  it("formats near-future English timestamps with 'in' prefix", () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.equal(
        formatRelativeTime(1_700_000_005_000, { locale: "en" }),
        "in 5s",
      );
    } finally {
      Date.now = originalNow;
    }
  });
});

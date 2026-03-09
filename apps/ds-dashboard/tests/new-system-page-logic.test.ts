import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSystemNameCollision, normalizeSystemNameForCollision } from "../src/features/system/new-system-page-logic";

describe("new-system-page logic", () => {
  it("normalizes names for collision checks", () => {
    assert.equal(
      normalizeSystemNameForCollision("  PatternFly   Community "),
      "patternfly community",
    );
  });

  it("detects case-insensitive collisions", () => {
    const collision = findSystemNameCollision({
      candidateName: "patternfly community",
      systems: [{ id: "pf", name: "PatternFly Community" }],
    });

    assert.equal(collision?.id, "pf");
  });

  it("returns null when there is no collision", () => {
    const collision = findSystemNameCollision({
      candidateName: "New System",
      systems: [{ id: "pf", name: "PatternFly Community" }],
    });

    assert.equal(collision, null);
  });
});

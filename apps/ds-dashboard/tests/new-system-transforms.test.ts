import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasNoCaptureTargets } from "../src/features/system/lib/new-system-transforms.js";

describe("new-system transforms", () => {
  describe("hasNoCaptureTargets", () => {
    it("returns false when dry-run report includes targets", () => {
      const value = hasNoCaptureTargets({
        ok: true,
        report: {
          targets_total: 3,
          targets: [{}, {}, {}],
        },
      });

      assert.equal(value, false);
    });

    it("returns true when both top-level and report targets are empty", () => {
      const value = hasNoCaptureTargets({
        ok: true,
        report: {
          targets_total: 0,
          targets: [],
        },
      });

      assert.equal(value, true);
    });
  });
});

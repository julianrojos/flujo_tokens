import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeVariantName } from "../lib/spec-viewer-utils";

describe("spec-viewer-utils", () => {
  describe("normalizeVariantName", () => {
    it("normaliza espacios y mayúsculas", () => {
      assert.equal(normalizeVariantName("  Size=Large  "), "size=large");
    });

    it("normaliza solo mayúsculas", () => {
      assert.equal(normalizeVariantName("State=Hover"), "state=hover");
    });

    it("maneja string vacío", () => {
      assert.equal(normalizeVariantName(""), "");
    });

    it("maneja solo espacios", () => {
      assert.equal(normalizeVariantName("   "), "");
    });
  });
});

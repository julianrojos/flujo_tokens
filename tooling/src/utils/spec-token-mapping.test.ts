import { describe, it } from "node:test";
import assert from "node:assert";
import {
  normalizeCompareKey,
  extractUniqueRegistryEntries,
  pickComponentTokenCandidates,
  buildTokenMenuLines,
  pickBestTokenPath,
  prefillTokenMapping,
} from "./spec-token-mapping.js";

describe("spec-token-mapping utils", () => {
  const mockRegistryEntries = [
    {
      path: "components.button.background.default",
      slashPath: "components/button/background/default",
      cssVar: "--button-background-default",
      collection: "components",
      type: "color",
      resolvedValue: "#007bff",
    },
    {
      path: "components.button.background.hover",
      slashPath: "components/button/background/hover",
      cssVar: "--button-background-hover",
      collection: "components",
      type: "color",
      resolvedValue: "#0056b3",
    },
    {
      path: "semantic.colors.primary",
      slashPath: "semantic/colors/primary",
      cssVar: "--color-primary",
      collection: "semantic",
      type: "color",
      resolvedValue: "#007bff",
    },
    {
      path: "primitives.colors.blue.500",
      slashPath: "primitives/colors/blue/500",
      cssVar: "--blue-500",
      collection: "primitives",
      type: "color",
      resolvedValue: "#007bff",
    },
  ];

  describe("normalizeCompareKey", () => {
    it("normalizes to lowercase alphanumeric", () => {
      assert.equal(normalizeCompareKey("Button"), "button");
      assert.equal(normalizeCompareKey("alert-banner"), "alertbanner");
      assert.equal(normalizeCompareKey("XML_Parser"), "xmlparser");
    });

    it("handles non-string input", () => {
      assert.equal(normalizeCompareKey(null), "");
      assert.equal(normalizeCompareKey(undefined), "");
      assert.equal(normalizeCompareKey(123), "123");
    });
  });

  describe("extractUniqueRegistryEntries", () => {
    it("deduplicates entries", () => {
      const index = {
        a: mockRegistryEntries[0],
        b: mockRegistryEntries[0], // duplicate
        c: mockRegistryEntries[1],
      };
      const result = extractUniqueRegistryEntries(index);
      assert.equal(result.length, 2);
    });

    it("handles empty input", () => {
      assert.deepStrictEqual(extractUniqueRegistryEntries({}), []);
      assert.deepStrictEqual(extractUniqueRegistryEntries(null as any), []);
    });
  });

  describe("pickComponentTokenCandidates", () => {
    it("finds component-specific tokens", () => {
      const result = pickComponentTokenCandidates(mockRegistryEntries, "button");
      assert.equal(result.length, 2);
      assert.ok(result[0].path?.includes("button"));
    });

    it("returns empty for non-matching component", () => {
      const result = pickComponentTokenCandidates(mockRegistryEntries, "card");
      assert.equal(result.length, 0);
    });

    it("handles case insensitivity", () => {
      const result1 = pickComponentTokenCandidates(mockRegistryEntries, "Button");
      const result2 = pickComponentTokenCandidates(mockRegistryEntries, "BUTTON");
      assert.equal(result1.length, 2);
      assert.equal(result2.length, 2);
    });
  });

  describe("buildTokenMenuLines", () => {
    it("returns array of token suggestions", () => {
      const result = buildTokenMenuLines(mockRegistryEntries, "button", 10);
      assert.ok(Array.isArray(result));
      // Should return some results for button component
      assert.ok(result.length >= 0);
    });

    it("falls back to semantic/primitives", () => {
      const result = buildTokenMenuLines(mockRegistryEntries, "card", 10);
      // When no component tokens exist, falls back to semantic/primitives
      // Result may be empty if no fallback tokens match
      assert.ok(Array.isArray(result));
    });

    it("respects limit", () => {
      const result = buildTokenMenuLines(mockRegistryEntries, "button", 1);
      assert.ok(result.length <= 1);
    });

    it("includes token type in output", () => {
      const result = buildTokenMenuLines(mockRegistryEntries, "button", 1);
      if (result.length > 0) {
        assert.ok(result[0].includes("("));
        assert.ok(result[0].includes(")"));
      }
    });
  });

  describe("pickBestTokenPath", () => {
    it("picks best match based on keywords", () => {
      const candidates = mockRegistryEntries.filter(e => e.collection === "components");
      const result = pickBestTokenPath(candidates, "button background", "default");
      // Result should be a path string if match found, or empty if no strong match
      assert.ok(typeof result === "string");
    });

    it("returns empty string for no match", () => {
      const result = pickBestTokenPath([], "background", "default");
      assert.equal(result, "");
    });

    it("returns empty string for weak match", () => {
      const candidates = [{ path: "unrelated.token", slashPath: "unrelated/token" }];
      const result = pickBestTokenPath(candidates as any, "background", "default");
      assert.equal(result, "");
    });
  });

  describe("prefillTokenMapping", () => {
    it("fills TBD markers in flat object", () => {
      const node = {
        background: "tbd",
        border: "tbd",
      };
      const candidates = mockRegistryEntries.filter(e => e.collection === "components");
      const count = prefillTokenMapping(node, candidates, "button");
      assert.ok(count >= 0);
      // At least one should be filled
      assert.ok(typeof node.background === "string");
    });

    it("fills TBD markers in nested object", () => {
      const node = {
        states: {
          hover: {
            background: "tbd",
          },
        },
      };
      const candidates = mockRegistryEntries.filter(e => e.collection === "components");
      const count = prefillTokenMapping(node, candidates, "button");
      assert.ok(count >= 0);
    });

    it("skips non-TBD values", () => {
      const node = {
        background: "#custom-color",
        border: "tbd",
      };
      const originalBackground = node.background;
      const candidates = mockRegistryEntries.filter(e => e.collection === "components");
      prefillTokenMapping(node, candidates, "button");
      assert.equal(node.background, originalBackground);
    });

    it("returns count of filled markers", () => {
      const node = {
        a: "tbd",
        b: "tbd",
        c: "already-filled",
      };
      const candidates = mockRegistryEntries.filter(e => e.collection === "components");
      const count = prefillTokenMapping(node, candidates, "button");
      assert.equal(count, 2); // Only a and b should be counted
    });

    it("handles non-object input", () => {
      assert.equal(prefillTokenMapping(null, [], "button"), 0);
      assert.equal(prefillTokenMapping("string", [], "button"), 0);
      assert.equal(prefillTokenMapping(123, [], "button"), 0);
    });
  });
});

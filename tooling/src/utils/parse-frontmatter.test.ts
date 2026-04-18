import { describe, it } from "node:test";
import assert from "node:assert";
import { parseYamlDocument } from "./parse-frontmatter.js";

describe("parse-frontmatter utils", () => {
  describe("parseYamlDocument", () => {
    it("parses valid YAML", () => {
      const result = parseYamlDocument<{ name: string; count: number }>("name: test\ncount: 42");
      assert.equal(result.name, "test");
      assert.equal(result.count, 42);
    });

    it("returns empty object for null/undefined", () => {
      assert.deepStrictEqual(parseYamlDocument("null"), {});
      assert.deepStrictEqual(parseYamlDocument("~"), {});
    });

    it("throws on invalid YAML", () => {
      assert.throws(
        () => parseYamlDocument("invalid: yaml: :"),
        /Invalid YAML document/
      );
    });

    it("throws on non-object YAML", () => {
      assert.throws(
        () => parseYamlDocument("- item1\n- item2"),
        /must parse to an object/
      );
    });

    it("uses custom source label in error", () => {
      // When YAML parses to an array (not object), it throws with custom label
      assert.throws(
        () => parseYamlDocument("- item", "custom config"),
        /custom config/
      );
    });
  });
});

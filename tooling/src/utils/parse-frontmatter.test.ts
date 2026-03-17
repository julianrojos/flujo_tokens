import { describe, it } from "node:test";
import assert from "node:assert";
import { parseYamlDocument, parseMarkdownFrontmatter } from "./parse-frontmatter.js";

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

  describe("parseMarkdownFrontmatter", () => {
    it("parses markdown with frontmatter", () => {
      const input = "---\ntitle: Test\n---\nContent here";
      const result = parseMarkdownFrontmatter<{ title: string }>(input);
      assert.equal(result.frontmatter.title, "Test");
      assert.equal(result.content, "Content here");
    });

    it("returns empty frontmatter for markdown without it", () => {
      const input = "Just content";
      const result = parseMarkdownFrontmatter(input);
      assert.deepStrictEqual(result.frontmatter, {});
      assert.equal(result.content, "Just content");
    });

    it("handles CRLF line endings", () => {
      const input = "---\r\ntitle: Test\r\n---\r\nContent";
      const result = parseMarkdownFrontmatter<{ title: string }>(input);
      assert.equal(result.frontmatter.title, "Test");
      assert.equal(result.content, "Content");
    });

    it("returns empty frontmatter if closing --- is missing", () => {
      const input = "---\ntitle: Test\nContent";
      const result = parseMarkdownFrontmatter(input);
      assert.deepStrictEqual(result.frontmatter, {});
      assert.ok(result.content.includes("---"));
    });

    it("preserves content after frontmatter", () => {
      const input = "---\nkey: value\n---\n\n# Heading\n\nParagraph";
      const result = parseMarkdownFrontmatter<{ key: string }>(input);
      assert.equal(result.frontmatter.key, "value");
      assert.ok(result.content.includes("# Heading"));
      assert.ok(result.content.includes("Paragraph"));
    });
  });
});

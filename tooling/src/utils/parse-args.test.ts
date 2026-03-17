import { describe, it } from "node:test";
import assert from "node:assert";
import { parseArgs, renderUsage } from "./parse-args.js";

describe("parse-args utils", () => {
  describe("parseArgs", () => {
    it("parses --key=value format", () => {
      const result = parseArgs(["--file=test.yml", "--output=dist"]);
      assert.equal(result.file, "test.yml");
      assert.equal(result.output, "dist");
    });

    it("parses --key value format", () => {
      const result = parseArgs(["--file", "test.yml", "--output", "dist"]);
      assert.equal(result.file, "test.yml");
      assert.equal(result.output, "dist");
    });

    it("handles boolean flags", () => {
      const result = parseArgs(["--verbose", "--dry-run"]);
      assert.equal(result.verbose, true);
      assert.equal(result["dry-run"], true);
    });

    it("handles mixed formats", () => {
      const result = parseArgs(["--file=test.yml", "--verbose", "--output", "dist"]);
      assert.equal(result.file, "test.yml");
      assert.equal(result.verbose, true);
      assert.equal(result.output, "dist");
    });

    it("stops at non-option arguments", () => {
      const result = parseArgs(["--file=test.yml", "argument", "--output", "dist"]);
      assert.equal(result.file, "test.yml");
      assert.equal(result.output, "dist");
    });

    it("returns empty object for no args", () => {
      const result = parseArgs([]);
      assert.deepStrictEqual(result, {});
    });

    it("handles consecutive flags", () => {
      const result = parseArgs(["--verbose", "--dry-run", "--force"]);
      assert.equal(result.verbose, true);
      assert.equal(result["dry-run"], true);
      assert.equal(result.force, true);
    });
  });

  describe("renderUsage", () => {
    it("renders command and description", () => {
      const result = renderUsage({
        command: "my-cli [options]",
        description: "My CLI tool",
      });
      assert.ok(result.includes("Usage: my-cli [options]"));
      assert.ok(result.includes("My CLI tool"));
    });

    it("renders options with descriptions", () => {
      const result = renderUsage({
        options: [
          { name: "--file", description: "Input file", required: true },
          { name: "--output", description: "Output directory", defaultValue: "dist" },
        ],
      });
      assert.ok(result.includes("Options:"));
      assert.ok(result.includes("--file (required)"));
      assert.ok(result.includes("Input file"));
      assert.ok(result.includes("--output (default: dist)"));
    });

    it("renders examples", () => {
      const result = renderUsage({
        examples: ["my-cli --file=test.yml", "my-cli --help"],
      });
      assert.ok(result.includes("Examples:"));
      assert.ok(result.includes("my-cli --file=test.yml"));
    });

    it("handles empty config", () => {
      const result = renderUsage({});
      assert.ok(result.endsWith("\n"));
    });
  });
});

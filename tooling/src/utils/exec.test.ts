import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildNodeScriptCommandArgs,
  buildNodeScriptDisplayArgs,
  parseJsonFromText,
  runJsonCommand,
} from "./exec.js";

describe("exec utils", () => {
  describe("parseJsonFromText", () => {
    it("parses clean JSON", () => {
      const result = parseJsonFromText('{"ok": true, "value": 42}');
      assert.equal(result.ok, true);
      assert.deepStrictEqual(result.value, { ok: true, value: 42 });
    });

    it("returns error for empty input", () => {
      const result = parseJsonFromText("");
      assert.equal(result.ok, false);
      assert.equal(result.error, "Empty output. Expected JSON payload.");
    });

    it("extracts JSON from text with prefix", () => {
      const input = "Some log text\n{\"status\": \"ok\"}\nMore text";
      const result = parseJsonFromText(input);
      assert.equal(result.ok, true);
      assert.deepStrictEqual(result.value, { status: "ok" });
    });

    it("extracts JSON array from text", () => {
      const input = "Prefix [1, 2, 3] suffix";
      const result = parseJsonFromText(input);
      assert.equal(result.ok, true);
      assert.deepStrictEqual(result.value, [1, 2, 3]);
    });

    it("handles nested JSON objects", () => {
      const input = '{"outer": {"inner": {"deep": "value"}}}';
      const result = parseJsonFromText(input);
      assert.equal(result.ok, true);
      assert.deepStrictEqual(result.value, { outer: { inner: { deep: "value" } } });
    });

    it("returns error for invalid JSON", () => {
      const result = parseJsonFromText("not json at all");
      assert.equal(result.ok, false);
      assert.equal(result.error, "No valid JSON value found in output.");
    });
  });

  describe("runJsonCommand", () => {
    it("runs command and parses JSON output", () => {
      const result = runJsonCommand<{ ok: boolean }>("node", ["-e", 'console.log(JSON.stringify({ok: true}))']);
      assert.equal(result.status, 0);
      assert.equal(result.data.ok, true);
    });

    it("throws when command exits with non-zero code", () => {
      assert.throws(
        () => runJsonCommand("node", ["-e", 'console.log(JSON.stringify({ok: true})); process.exit(1)']),
        /Command failed \(1\)/
      );
    });

    it("throws when output is empty (no JSON to parse)", () => {
      assert.throws(
        () => runJsonCommand("node", ["-e", "process.exit(1)"]),
        /invalid JSON/
      );
    });

    it("allows non-zero exit with option", () => {
      const result = runJsonCommand<{ ok: boolean }>(
        "node",
        ["-e", 'console.log(JSON.stringify({ok: true})); process.exit(1)'],
        { allowNonZeroExit: true }
      );
      assert.equal(result.data.ok, true);
    });

    it("throws on invalid JSON output", () => {
      assert.throws(
        () => runJsonCommand("node", ["-e", 'console.log("not json")']),
        /invalid JSON/
      );
    });
  });

  describe("buildNodeScriptCommandArgs", () => {
    it("adds tsx loader for TypeScript runners", () => {
      assert.deepStrictEqual(
        buildNodeScriptCommandArgs("tooling/src/runners/capture-visual-proof-runner.ts", [
          "--system",
          "core",
        ]),
        [
          "--import",
          "tsx",
          "tooling/src/runners/capture-visual-proof-runner.ts",
          "--system",
          "core",
        ],
      );
    });

    it("keeps plain JS runners unchanged", () => {
      assert.deepStrictEqual(
        buildNodeScriptCommandArgs("tooling/scripts/capture.mjs", ["--system", "core"]),
        ["tooling/scripts/capture.mjs", "--system", "core"],
      );
    });
  });

  describe("buildNodeScriptDisplayArgs", () => {
    it("shows relative path and tsx loader for TypeScript runners", () => {
      assert.deepStrictEqual(
        buildNodeScriptDisplayArgs(
          "/repo",
          "/repo/tooling/src/runners/capture-visual-proof-runner.ts",
          ["--system", "core"],
        ),
        [
          "--import",
          "tsx",
          "tooling/src/runners/capture-visual-proof-runner.ts",
          "--system",
          "core",
        ],
      );
    });
  });
});

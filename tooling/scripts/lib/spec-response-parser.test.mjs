import test from "node:test";
import assert from "node:assert/strict";

import { parseYamlResponse } from "./spec-response-parser.mjs";

test("spec-response-parser: parses clean yaml", () => {
  const result = parseYamlResponse("name: Alert\nstatus: draft");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { name: "Alert", status: "draft" });
});

test("spec-response-parser: strips markdown fences", () => {
  const raw = "```yaml\nname: Button\n```";
  const result = parseYamlResponse(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { name: "Button" });
});

test("spec-response-parser: handles malformed yaml", () => {
  const result = parseYamlResponse("name: [unclosed array");
  assert.equal(result.ok, false);
  assert.equal(result.data, null);
  assert.ok(result.error.includes("unexpected end of the stream"));
});

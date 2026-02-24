import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from "./capture-options.mjs";

test("capture-options: parseBooleanOption handles true/false", () => {
  assert.equal(parseBooleanOption("true", "--flag", false), true);
  assert.equal(parseBooleanOption("false", "--flag", true), false);
});

test("capture-options: parsePositiveNumber validates numeric input", () => {
  assert.equal(parsePositiveNumber("2", "--scale", 1), 2);
  assert.throws(() => parsePositiveNumber("0", "--scale", 1));
});

test("capture-options: parseComponentKind and parseMainCaptureMode validate enums", () => {
  assert.equal(parseComponentKind("component_set"), "component_set");
  assert.equal(parseComponentKind("all"), "all");
  assert.equal(parseMainCaptureMode("rest"), "rest");
  assert.equal(parseMainCaptureMode("auto"), "auto");
  assert.throws(() => parseComponentKind("invalid"));
  assert.throws(() => parseMainCaptureMode("invalid"));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBypassPolicy,
  assertFigmaSourceProvided,
  assertOutputPath,
} from "./spec-run-guards.mjs";

test("spec-run-guards: assertBypassPolicy enforces force for skip-validation", () => {
  assert.throws(() =>
    assertBypassPolicy({ force: false, skipValidation: true, allowNonEvidenceUpdates: false }),
  );

  assert.doesNotThrow(() =>
    assertBypassPolicy({ force: true, skipValidation: true, allowNonEvidenceUpdates: false }),
  );
});

test("spec-run-guards: assertBypassPolicy enforces force for evidence bypass", () => {
  assert.throws(() =>
    assertBypassPolicy({ force: false, skipValidation: false, allowNonEvidenceUpdates: true }),
  );

  assert.doesNotThrow(() =>
    assertBypassPolicy({ force: true, skipValidation: false, allowNonEvidenceUpdates: true }),
  );
});

test("spec-run-guards: source/output assertions are explicit", () => {
  assert.throws(() =>
    assertFigmaSourceProvided({ figmaUrl: "", nodeId: "", rawComponentName: "" }),
  );
  assert.doesNotThrow(() =>
    assertFigmaSourceProvided({ figmaUrl: "https://figma.com/file/x", nodeId: "", rawComponentName: "" }),
  );

  assert.throws(() => assertOutputPath(""));
  assert.doesNotThrow(() => assertOutputPath("/tmp/spec.yml"));
});

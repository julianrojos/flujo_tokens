import assert from "node:assert/strict";
import test from "node:test";

import { runSpecGenerationFlow } from "./spec-generation-flow.mjs";

test("spec-generation-flow: success path without repair", () => {
  const result = runSpecGenerationFlow({
    prompt: "prompt",
    agent: "auto",
    componentName: "Alert",
    nodeId: "1:1",
    skipValidation: false,
    outputPath: "/tmp/alert.yml",
    registryPath: "/tmp/registry.json",
    runSpecGenerationPromptFn: () => {},
    runSpecRepairPromptFn: () => {
      throw new Error("should not run");
    },
    validateGeneratedSpecFn: () => ({ ok: true, report: { ok: true }, errors: [] }),
    materializeGeneratedSpec: () => ({ normalizedSpec: { name: "Alert" }, prefilledCount: 1 }),
  });

  assert.equal(result.prefilledCount, 1);
  assert.deepEqual(result.validationReport, { ok: true });
});

test("spec-generation-flow: failed validation triggers repair", () => {
  let validationCalls = 0;
  const result = runSpecGenerationFlow({
    prompt: "prompt",
    agent: "auto",
    componentName: "Alert",
    nodeId: "1:1",
    skipValidation: false,
    outputPath: "/tmp/alert.yml",
    registryPath: "/tmp/registry.json",
    runSpecGenerationPromptFn: () => {},
    runSpecRepairPromptFn: () => {},
    validateGeneratedSpecFn: () => {
      validationCalls += 1;
      if (validationCalls === 1) {
        return { ok: false, report: { ok: false }, errors: [{ code: "SPEC01" }] };
      }
      return { ok: true, report: { ok: true }, errors: [] };
    },
    materializeGeneratedSpec: () => ({ normalizedSpec: { name: "Alert" }, prefilledCount: 2 }),
  });

  assert.equal(validationCalls, 2);
  assert.equal(result.prefilledCount, 2);
  assert.deepEqual(result.validationReport, { ok: true });
});

test("spec-generation-flow: throws after repair if still invalid", () => {
  assert.throws(() =>
    runSpecGenerationFlow({
      prompt: "prompt",
      agent: "auto",
      componentName: "Alert",
      nodeId: "1:1",
      skipValidation: false,
      outputPath: "/tmp/alert.yml",
      registryPath: "/tmp/registry.json",
      runSpecGenerationPromptFn: () => {},
      runSpecRepairPromptFn: () => {},
      validateGeneratedSpecFn: () => ({ ok: false, report: { ok: false }, errors: [{ code: "SPEC01" }] }),
      materializeGeneratedSpec: () => ({ normalizedSpec: { name: "Alert" }, prefilledCount: 0 }),
    }),
  );
});

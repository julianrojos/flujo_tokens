import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpecAgentLabel,
  buildSpecPrompt,
  buildSpecValidationFeedbackPrompt,
} from "./spec-agent-runner.mjs";

test("spec-agent-runner: buildSpecPrompt includes deterministic sections and constraints", () => {
  const prompt = buildSpecPrompt({
    figmaUrl: "https://www.figma.com/design/abc/file?node-id=1-2",
    nodeId: "1:2",
    componentName: "Alert",
    outputPath: "/repo/docs/_spec/components/alert.yml",
    templatePath: "/repo/docs/_spec/components/_template.yml",
    registryPath: "/repo/docs/_generated/token-registry.json",
    fileKeyFromUrl: "abc",
    tokenMenuLines: ["components/alert/background (color: #fff)"],
  });

  assert.match(prompt, /^Context\n-/);
  assert.match(prompt, /\nSources\n-/);
  assert.match(prompt, /\nConstraints\n-/);
  assert.match(prompt, /\nExpected Output\n-/);
  assert.match(prompt, /Top-level YAML key order must be:/);
  assert.match(prompt, /Token menu \(prefer these exact paths when applicable\):/);
  assert.match(prompt, /Never use Figma internal variable IDs/);
});

test("spec-agent-runner: buildSpecValidationFeedbackPrompt appends actionable validation details", () => {
  const feedback = buildSpecValidationFeedbackPrompt({
    basePrompt: "Context\n- test",
    outputPath: "/repo/docs/_spec/components/alert.yml",
    validationErrors: [{ code: "SPEC01", message: "invalid type" }],
  });

  assert.match(feedback, /Validation Feedback/);
  assert.match(feedback, /failed validation/);
  assert.match(feedback, /SPEC01/);
  assert.match(feedback, /invalid type/);
  assert.match(feedback, /output file in place/);
});

test("spec-agent-runner: label generation is stable for generate and repair flows", () => {
  const generateLabel = buildSpecAgentLabel({
    kind: "generate",
    componentName: "Alert Banner",
    nodeId: "1:2",
  });
  const repairLabel = buildSpecAgentLabel({
    kind: "repair",
    componentName: "Alert Banner",
    nodeId: "1:2",
  });
  const fallbackLabel = buildSpecAgentLabel({
    kind: "generate",
    componentName: "",
    nodeId: "1:2",
  });

  assert.equal(generateLabel, "spec-from-figma-alert_banner");
  assert.equal(repairLabel, "spec-from-figma-repair-alert_banner");
  assert.equal(fallbackLabel, "spec-from-figma-1_2");
});

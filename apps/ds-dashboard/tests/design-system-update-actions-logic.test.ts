import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildUpdateComponentsPayload,
  buildUpdateVariablesPayload,
  resolveUpdateButtonLabel,
} from "../src/features/system/design-system-update-actions-logic";

describe("design-system update actions logic", () => {
  it("requires Figma URL for components payload", () => {
    const result = buildUpdateComponentsPayload({
      figmaUrl: "   ",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "Figma URL is required to update components.");
  });

  it("builds components payload with required defaults and optional token", () => {
    const result = buildUpdateComponentsPayload({
      figmaUrl: " https://www.figma.com/design/abc123/Test ",
      figmaToken: " figd_secret ",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(result.payload, {
      figmaUrl: "https://www.figma.com/design/abc123/Test",
      includeVariants: false,
      variantLimit: 6,
      requireExistingDoc: true,
      continueOnError: true,
      dryRun: false,
      injectDocSpecs: false,
      mainCaptureMode: "rest",
      componentKind: "component_set",
      tokensSource: "mcp",
      figmaToken: "figd_secret",
    });
  });

  it("builds variables payload with optional fields", () => {
    const payload = buildUpdateVariablesPayload({
      figmaUrl: "https://www.figma.com/design/xyz789/File",
      figmaToken: "",
    });

    assert.deepEqual(payload, {
      dryRun: false,
      force: true,
      merge: true,
      compile: true,
      url: "https://www.figma.com/design/xyz789/File",
    });
  });

  it("resolves button labels for idle and running states", () => {
    assert.equal(
      resolveUpdateButtonLabel({ type: "components", isRunning: false }),
      "Update components",
    );
    assert.equal(
      resolveUpdateButtonLabel({ type: "variables", isRunning: false }),
      "Update variables",
    );
    assert.equal(
      resolveUpdateButtonLabel({ type: "components", isRunning: true }),
      "Updating...",
    );
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureFromFigmaPayload } from "./figma-capture-payload";

test("buildCaptureFromFigmaPayload trims inputs and applies defaults", () => {
  const payload = buildCaptureFromFigmaPayload({
    figmaUrl: "  https://www.figma.com/design/abc/Test  ",
    figmaToken: "  secret-token  ",
  });

  assert.equal(payload.figmaUrl, "https://www.figma.com/design/abc/Test");
  assert.equal(payload.figmaToken, "secret-token");
  assert.equal(payload.includeVariants, false);
  assert.equal(payload.variantLimit, 6);
  assert.equal(payload.requireExistingDoc, false);
  assert.equal(payload.continueOnError, true);
  assert.equal(payload.dryRun, false);
  assert.equal(payload.mainCaptureMode, "rest");
  assert.equal(payload.componentKind, "component_set");
  assert.equal(payload.tokensSource, "mcp");
  assert.equal(payload.injectDocSpecs, false);
});

test("buildCaptureFromFigmaPayload rejects empty URLs", () => {
  assert.throws(
    () =>
      buildCaptureFromFigmaPayload({
        figmaUrl: "   ",
      }),
    /Figma URL is required to capture from Figma\./,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildCaptureArgs, runCaptureBatch } from "./capture-batch-runner.mjs";

test("capture-orchestrator: buildCaptureArgs adds spec file when target has spec", () => {
  const args = buildCaptureArgs({
    target: {
      markdownPath: "/repo/docs/components/button.md",
      nodeId: "1:1",
      nodeUrl: "https://figma.com/node",
      specExists: true,
      specPath: "/repo/docs/_spec/components/button.yml",
    },
    figmaToken: "token",
    format: "png",
    scale: 2,
    proofDir: "/repo/docs/_generated/visual-proofs",
    proofImageDir: "/repo/docs/_generated/visual-proofs/images",
    includeVariants: true,
    variantLimit: 6,
    agent: "auto",
    mainCaptureMode: "rest",
  });

  const joined = args.join(" ");
  assert.match(joined, /--spec-file \/repo\/docs\/_spec\/components\/button\.yml/);
});

test("capture-orchestrator: runCaptureBatch aggregates captured and failed with continueOnError", () => {
  const targets = [
    {
      slug: "button",
      nodeId: "1:1",
      nodeUrl: "https://figma.com/node1",
      markdownPath: "/repo/docs/components/button.md",
      specExists: false,
    },
    {
      slug: "alert",
      nodeId: "2:2",
      nodeUrl: "https://figma.com/node2",
      markdownPath: "/repo/docs/components/alert.md",
      specExists: false,
    },
  ];

  let calls = 0;
  const result = runCaptureBatch({
    targets,
    repoRoot: "/repo",
    captureScriptPath: "/repo/tooling/scripts/ds-capture-visual-proof.mjs",
    runScriptJson: () => {
      calls += 1;
      if (calls === 1) return { screenshotUrl: "https://img/1.png", variantsCount: 3 };
      throw new Error("capture failed");
    },
    continueOnError: true,
    figmaToken: "token",
    format: "png",
    scale: 2,
    proofDir: "/repo/docs/_generated/visual-proofs",
    proofImageDir: "/repo/docs/_generated/visual-proofs/images",
    includeVariants: true,
    variantLimit: 6,
    agent: "auto",
    mainCaptureMode: "rest",
  });

  assert.equal(result.captured.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.captured[0].slug, "button");
  assert.equal(result.failed[0].slug, "alert");
});

test("capture-orchestrator: runCaptureBatch stops on first failure when continueOnError=false", () => {
  const targets = [
    {
      slug: "button",
      nodeId: "1:1",
      nodeUrl: "https://figma.com/node1",
      markdownPath: "/repo/docs/components/button.md",
      specExists: false,
    },
    {
      slug: "alert",
      nodeId: "2:2",
      nodeUrl: "https://figma.com/node2",
      markdownPath: "/repo/docs/components/alert.md",
      specExists: false,
    },
  ];

  let calls = 0;
  const result = runCaptureBatch({
    targets,
    repoRoot: "/repo",
    captureScriptPath: "/repo/tooling/scripts/ds-capture-visual-proof.mjs",
    runScriptJson: () => {
      calls += 1;
      throw new Error("capture failed");
    },
    continueOnError: false,
    figmaToken: "token",
    format: "png",
    scale: 2,
    proofDir: "/repo/docs/_generated/visual-proofs",
    proofImageDir: "/repo/docs/_generated/visual-proofs/images",
    includeVariants: true,
    variantLimit: 6,
    agent: "auto",
    mainCaptureMode: "rest",
  });

  assert.equal(calls, 1);
  assert.equal(result.captured.length, 0);
  assert.equal(result.failed.length, 1);
});

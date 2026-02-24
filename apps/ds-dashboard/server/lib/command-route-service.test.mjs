import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  buildRunScriptCommandArgs,
  buildSyncFigmaTokensCommandConfig,
} from "./command-route-service.mjs";

test("command-route-service: buildRunScriptCommandArgs adds pipeline options", () => {
  const payload = buildRunScriptCommandArgs({
    scriptName: "ds:pipeline",
    systemId: "core",
    body: { all: true, component: "button", fromStep: "markdown", dryRun: true },
  });
  assert.deepEqual(payload.args, [
    "run",
    "ds:pipeline",
    "--",
    "--system",
    "core",
    "--all",
    "--component",
    "button",
    "--from-step",
    "markdown",
    "--status-only",
  ]);
});

test("command-route-service: buildHealthSnapshotCommandConfig validates git ref", () => {
  const invalid = buildHealthSnapshotCommandConfig({
    body: { beforeRef: "???" },
    validateGitRef: () => null,
    toBooleanString: () => "false",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorArgs.code, "validation.invalid_git_ref");

  const valid = buildHealthSnapshotCommandConfig({
    body: { beforeRef: "HEAD~2", retentionDays: 30, skipDiff: true },
    validateGitRef: (value) => value,
    toBooleanString: (value) => (value ? "true" : "false"),
  });
  assert.equal(valid.ok, true);
  assert.ok(valid.commandLabel.includes("--before-ref HEAD~2"));
});

test("command-route-service: buildSyncFigmaTokensCommandConfig redacts figma token", () => {
  const payload = buildSyncFigmaTokensCommandConfig({
    body: {
      figmaUrl: "https://www.figma.com/file/abc/xyz",
      figmaToken: "secret",
      dryRun: false,
    },
    toBooleanString: (value, fallback) => (value === undefined ? (fallback ? "true" : "false") : String(!!value)),
  });
  assert.ok(payload.commandArgs.includes("secret"));
  assert.ok(payload.commandDisplayArgs.includes("***redacted***"));
});

test("command-route-service: buildCaptureFigmaScreenshotCommandConfig validates url and host", () => {
  const missing = buildCaptureFigmaScreenshotCommandConfig({
    body: {},
    toBooleanString: () => "false",
    toNumberString: () => "1",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.errorArgs.code, "validation.figma_url_required");

  const invalidHost = buildCaptureFigmaScreenshotCommandConfig({
    body: { figmaUrl: "https://example.com/file/abc" },
    toBooleanString: () => "false",
    toNumberString: () => "1",
  });
  assert.equal(invalidHost.ok, false);
  assert.equal(invalidHost.errorArgs.code, "validation.invalid_figma_host");

  const valid = buildCaptureFigmaScreenshotCommandConfig({
    body: {
      figmaUrl: "https://www.figma.com/file/abc",
      figmaToken: "secret",
      componentSlug: "Button",
    },
    toBooleanString: (value, fallback) => (value === undefined ? (fallback ? "true" : "false") : String(!!value)),
    toNumberString: (value, fallback) => String(value ?? fallback),
  });
  assert.equal(valid.ok, true);
  assert.ok(valid.commandArgs.includes("--url"));
  assert.ok(valid.commandDisplayArgs.includes("***redacted***"));
});

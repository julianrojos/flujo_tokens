import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImpactFailure,
  loadImpactArtifacts,
  parseImpactRequest,
  parseRefreshQuery,
  parseTokenDiffBeforeRef,
} from "./analysis-route-service.mjs";

test("analysis-route-service: parseRefreshQuery returns strict true value", () => {
  assert.equal(parseRefreshQuery("true"), true);
  assert.equal(parseRefreshQuery(" true "), true);
  assert.equal(parseRefreshQuery("false"), false);
  assert.equal(parseRefreshQuery(undefined), false);
});

test("analysis-route-service: parseTokenDiffBeforeRef validates and normalizes", () => {
  const ok = parseTokenDiffBeforeRef("HEAD~2", (value) => String(value || "").trim());
  assert.equal(ok.ok, true);
  assert.equal(ok.beforeRef, "HEAD~2");

  const invalid = parseTokenDiffBeforeRef("bad ref", () => null);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.errorArgs.code, "validation.invalid_git_ref");
});

test("analysis-route-service: parseImpactRequest requires tokenPath", () => {
  const invalid = parseImpactRequest({
    tokenPathRaw: " ",
    newValueRaw: null,
    depthRaw: null,
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorArgs.code, "validation.token_path_required");

  const ok = parseImpactRequest({
    tokenPathRaw: "color.primary",
    newValueRaw: " #fff ",
    depthRaw: "3",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.tokenPath, "color.primary");
  assert.equal(ok.payload.newValue, "#fff");
  assert.equal(ok.payload.depth, 3);
});

test("analysis-route-service: loadImpactArtifacts parses all required payloads", async () => {
  const files = {
    "/token-registry.json": '{"ok":true}',
    "/token-graph-viz.json": '{"nodes":[],"edges":[]}',
    "/token-usage-index.json": '{"ok":true,"tokens":[]}',
    "/token-health.json": '{"ok":true}',
    "/component-registry.json": '{"components":[]}',
    "/wcag-pairs.json": '{"pairs":[{"a":"x","b":"y"}]}',
  };
  const loaded = await loadImpactArtifacts(
    {
      tokenRegistryPath: "/token-registry.json",
      tokenGraphVizPath: "/token-graph-viz.json",
      tokenUsageIndexPath: "/token-usage-index.json",
      tokenHealthPath: "/token-health.json",
      componentRegistryPath: "/component-registry.json",
      wcagPairsPath: "/wcag-pairs.json",
    },
    {
      readFileFn: async (filePath) => {
        if (!(filePath in files)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return files[filePath];
      },
      normalizeImpactWcagPairsFn: (value) => value,
    },
  );
  assert.deepEqual(loaded.tokenRegistry, { ok: true });
  assert.deepEqual(loaded.tokenGraph, { nodes: [], edges: [] });
  assert.deepEqual(loaded.wcagPairs, { pairs: [{ a: "x", b: "y" }] });
});

test("analysis-route-service: buildImpactFailure maps not found vs invalid request", () => {
  const notFound = buildImpactFailure("color.primary", new Error("token not found"));
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.errorArgs.code, "impact.token_not_found");

  const invalid = buildImpactFailure("color.primary", new Error("invalid payload"));
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.errorArgs.code, "impact.invalid_request");
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCreateDesignSystemConfigMutation,
  buildDeleteDesignSystemConfigMutation,
  buildUpdateDesignSystemConfigMutation,
} from "./system-route-service.mjs";

function createConfig() {
  return {
    defaultSystem: "alpha",
    systems: [
      {
        id: "alpha",
        name: "Alpha",
        inputDir: "input/alpha",
        outputDir: "output/alpha",
        docsDir: "docs/alpha",
        collections: ["primitives"],
        compileVariablesOnCapture: true,
      },
    ],
  };
}

test("system-route-service: create mutation validates required id/name", () => {
  const mutation = buildCreateDesignSystemConfigMutation({
    config: createConfig(),
    body: { id: "", name: "" },
    normalizeSystemId: (value) => String(value || ""),
    ensureRelativeDir: () => "",
    normalizeFigmaApiTokenRef: () => "",
    normalizeCollectionList: () => [],
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.missing_required_fields");
});

test("system-route-service: create mutation returns normalized next system", () => {
  const mutation = buildCreateDesignSystemConfigMutation({
    config: createConfig(),
    body: {
      id: "Beta Design",
      name: "Beta",
      figmaApiToken: "FIGMA_BETA",
      collections: ["primitives", "semantic"],
      makeDefault: true,
    },
    normalizeSystemId: (value) => String(value || "").toLowerCase().replace(/\s+/g, "-"),
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
    normalizeFigmaApiTokenRef: (value, fallback) => String(value || fallback || ""),
    normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
  });

  assert.ok(!mutation.error);
  assert.equal(mutation.nextSystem?.id, "beta-design");
  assert.equal(mutation.nextSystem?.inputDir, "input/beta-design");
  assert.equal(mutation.nextSystem?.figmaApiToken, "FIGMA_BETA");
  assert.equal(mutation.nextConfig?.defaultSystem, "beta-design");
  assert.equal(mutation.nextConfig?.systems.length, 2);
});

test("system-route-service: update mutation rejects unknown system", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "missing",
    body: {},
    ensureRelativeDir: () => "",
    normalizeFigmaApiTokenRef: () => "",
    normalizeCollectionList: () => [],
  });
  assert.equal(mutation.error?.status, 404);
  assert.equal(mutation.error?.payload.code, "design_system.not_found");
});

test("system-route-service: update mutation enforces non-empty name", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "alpha",
    body: { name: "   " },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
    normalizeFigmaApiTokenRef: (value) => String(value || ""),
    normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.invalid_name");
});

test("system-route-service: update mutation preserves id and updates directories", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "alpha",
    body: {
      name: "Alpha Two",
      inputDir: "input/alpha2",
      makeDefault: true,
      compileVariablesOnCapture: false,
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
    normalizeFigmaApiTokenRef: (value) => String(value || ""),
    normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
  });
  assert.ok(!mutation.error);
  assert.equal(mutation.updated?.id, "alpha");
  assert.equal(mutation.updated?.name, "Alpha Two");
  assert.equal(mutation.updated?.inputDir, "input/alpha2");
  assert.equal(mutation.updated?.compileVariablesOnCapture, false);
  assert.equal(mutation.nextConfig?.defaultSystem, "alpha");
});

test("system-route-service: delete mutation rejects missing system", () => {
  const missing = buildDeleteDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "missing",
  });
  assert.equal(missing.error?.status, 404);
});

test("system-route-service: delete mutation allows deleting the last system", () => {
  const singleConfig = createConfig();
  const mutation = buildDeleteDesignSystemConfigMutation({
    config: singleConfig,
    routeSystemId: "alpha",
  });
  assert.ok(!mutation.error);
  assert.equal(mutation.nextSystems?.length, 0);
  assert.equal(mutation.nextConfig?.systems.length, 0);
  assert.equal(mutation.nextConfig?.defaultSystem, "");
});

test("system-route-service: delete mutation computes next default when removing current default", () => {
  const config = {
    defaultSystem: "alpha",
    systems: [
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ],
  };
  const mutation = buildDeleteDesignSystemConfigMutation({
    config,
    routeSystemId: "alpha",
  });
  assert.ok(!mutation.error);
  assert.equal(mutation.nextConfig?.systems.length, 1);
  assert.equal(mutation.nextConfig?.systems[0]?.id, "beta");
  assert.equal(mutation.nextConfig?.defaultSystem, "beta");
});

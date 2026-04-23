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
        inputDir: "design-systems/alpha/input",
        outputDir: "design-systems/alpha/output",
        docsDir: "design-systems/alpha/docs",
        collections: ["primitives"],
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
      detectedComponentsCount: 10,
      importedComponentsCount: 7,
      pendingComponentsCount: 3,
      importedComponentNames: ["Core / Button", "Core / Input"],
      pendingComponentNames: ["Forms / Select"],
      makeDefault: true,
    },
    normalizeSystemId: (value) => String(value || "").toLowerCase().replace(/\s+/g, "-"),
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
    normalizeFigmaApiTokenRef: (value, fallback) => String(value || fallback || ""),
    normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
  });

  assert.ok(!mutation.error);
  assert.equal(mutation.nextSystem?.id, "beta-design");
  assert.equal(mutation.nextSystem?.inputDir, "design-systems/beta-design/input");
  assert.equal(mutation.nextSystem?.outputDir, "design-systems/beta-design/output");
  assert.equal(mutation.nextSystem?.docsDir, "design-systems/beta-design/docs");
  assert.equal(mutation.nextSystem?.figmaApiToken, "FIGMA_BETA");
  assert.equal(mutation.nextSystem?.detectedComponentsCount, 10);
  assert.equal(mutation.nextSystem?.importedComponentsCount, 7);
  assert.equal(mutation.nextSystem?.pendingComponentsCount, 3);
  assert.deepEqual(mutation.nextSystem?.importedComponentNames, ["Core / Button", "Core / Input"]);
  assert.deepEqual(mutation.nextSystem?.pendingComponentNames, ["Forms / Select"]);
  assert.equal(mutation.nextConfig?.defaultSystem, "beta-design");
  assert.equal(mutation.nextConfig?.systems.length, 2);
});

test("system-route-service: create mutation uses FIGMA_TOKEN fallback key", () => {
  let receivedFallback = "";
  const mutation = buildCreateDesignSystemConfigMutation({
    config: createConfig(),
    body: {
      id: "Gamma Design",
      name: "Gamma",
    },
    normalizeSystemId: (value) => String(value || "").toLowerCase().replace(/\s+/g, "-"),
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
    normalizeFigmaApiTokenRef: (_value, fallback) => {
      receivedFallback = String(fallback || "");
      return String(fallback || "");
    },
    normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
  });

  assert.ok(!mutation.error);
  assert.equal(receivedFallback, "FIGMA_TOKEN");
  assert.equal(mutation.nextSystem?.figmaApiToken, "FIGMA_TOKEN");
});

test("system-route-service: update mutation rejects unknown system", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "missing",
    body: {},
    ensureRelativeDir: () => "",
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
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.invalid_name");
});

test("system-route-service: update mutation preserves id and keeps directories immutable", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "alpha",
    body: {
      name: "Alpha Two",
      makeDefault: true,
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });
  assert.ok(!mutation.error);
  assert.equal(mutation.updated?.id, "alpha");
  assert.equal(mutation.updated?.name, "Alpha Two");
  assert.equal(mutation.updated?.inputDir, "design-systems/alpha/input");
  assert.equal(mutation.updated?.outputDir, "design-systems/alpha/output");
  assert.equal(mutation.updated?.docsDir, "design-systems/alpha/docs");
  assert.equal(mutation.nextConfig?.defaultSystem, "alpha");
});

test("system-route-service: update mutation rejects read-only figma identity and collections fields", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: {
      defaultSystem: "alpha",
      systems: [
        {
          id: "alpha",
          name: "Alpha",
          figmaFileId: "FILE_ORIGINAL",
          figmaApiToken: "FIGMA_TOKEN_ALPHA",
          collections: ["primitives"],
        },
      ],
    },
    routeSystemId: "alpha",
    body: {
      name: "Alpha",
      figmaFileId: "FILE_SHOULD_NOT_APPLY",
      figmaApiToken: "SHOULD_NOT_APPLY",
      collections: ["semantic"],
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.read_only_fields");
  assert.deepEqual(mutation.error?.payload.context?.fields, [
    "figmaFileId",
    "figmaApiToken",
    "collections",
  ]);
});

test("system-route-service: update mutation rejects read-only directory fields when changed", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: createConfig(),
    routeSystemId: "alpha",
    body: {
      name: "Alpha",
      inputDir: "design-systems/alpha-2/input",
      outputDir: "design-systems/alpha-2/output",
      docsDir: "design-systems/alpha-2/docs",
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.read_only_fields");
  assert.deepEqual(mutation.error?.payload.context?.fields, [
    "inputDir",
    "outputDir",
    "docsDir",
  ]);
});

test("system-route-service: update mutation tolerates mirrored read-only fields when values are identical", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: {
      defaultSystem: "alpha",
      systems: [
        {
          id: "alpha",
          name: "Alpha",
          appName: "Alpha App",
          figmaFileId: "FILE_ORIGINAL",
          figmaApiToken: "FIGMA_TOKEN_ALPHA",
          collections: ["primitives", "semantic"],
        },
      ],
    },
    routeSystemId: "alpha",
    body: {
      name: "Alpha v2",
      figmaFileId: "FILE_ORIGINAL",
      figmaApiToken: "FIGMA_TOKEN_ALPHA",
      collections: ["semantic", "primitives", "primitives"],
      inputDir: "design-systems/alpha/input",
      outputDir: "design-systems/alpha/output",
      docsDir: "design-systems/alpha/docs",
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });
  assert.ok(!mutation.error);
  assert.equal(mutation.updated?.name, "Alpha v2");
  assert.equal(mutation.updated?.figmaFileId, "FILE_ORIGINAL");
  assert.equal(mutation.updated?.figmaApiToken, "FIGMA_TOKEN_ALPHA");
  assert.deepEqual(mutation.updated?.collections, ["primitives", "semantic"]);
});

test("system-route-service: update mutation applies import snapshot fields when provided", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: {
      defaultSystem: "alpha",
      systems: [
        {
          id: "alpha",
          name: "Alpha",
          appName: "Alpha App",
          detectedComponentsCount: null,
          importedComponentsCount: null,
          pendingComponentsCount: null,
          importedComponentNames: [],
          pendingComponentNames: [],
        },
      ],
    },
    routeSystemId: "alpha",
    body: {
      detectedComponentsCount: 10,
      importedComponentsCount: 7,
      pendingComponentsCount: 3,
      importedComponentNames: ["Core / Button", "Core / Input"],
      pendingComponentNames: ["Forms / Select"],
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });

  assert.ok(!mutation.error);
  assert.equal(mutation.updated?.detectedComponentsCount, 10);
  assert.equal(mutation.updated?.importedComponentsCount, 7);
  assert.equal(mutation.updated?.pendingComponentsCount, 3);
  assert.deepEqual(mutation.updated?.importedComponentNames, ["Core / Button", "Core / Input"]);
  assert.deepEqual(mutation.updated?.pendingComponentNames, ["Forms / Select"]);
});

test("system-route-service: update mutation treats read-only collections as case-sensitive", () => {
  const mutation = buildUpdateDesignSystemConfigMutation({
    config: {
      defaultSystem: "alpha",
      systems: [
        {
          id: "alpha",
          name: "Alpha",
          collections: ["Primitives"],
        },
      ],
    },
    routeSystemId: "alpha",
    body: {
      name: "Alpha",
      collections: ["primitives"],
    },
    ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
  });
  assert.equal(mutation.error?.status, 400);
  assert.equal(mutation.error?.payload.code, "validation.read_only_fields");
  assert.deepEqual(mutation.error?.payload.context?.fields, ["collections"]);
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

import assert from "node:assert/strict";
import test from "node:test";

import { resolveComponentSpecRequestContext } from "./component-spec-route-service.mjs";

function baseArgs(overrides = {}) {
  return {
    requireDevEdit: false,
    systemHeader: "core",
    routeSlug: "button",
    getSystemContextFn: () => ({
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
    }),
    isDevRuntimeFn: () => true,
    sanitizeComponentSlugFn: (value) => String(value || "").trim(),
    resolveComponentSpecTargetFn: async () => ({
      ok: true,
      specRelPath: "docs/_spec/components/button.yml",
      specAbsPath: "/repo/docs/_spec/components/button.yml",
    }),
    resolveRepoFilePathFn: (value) => value,
    ...overrides,
  };
}

test("component-spec-route-service: blocks edit routes outside development", async () => {
  const result = await resolveComponentSpecRequestContext(
    baseArgs({
      requireDevEdit: true,
      isDevRuntimeFn: () => false,
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error?.statusCode, 403);
  assert.equal(result.error?.args.code, "component_spec.editing_disabled");
});

test("component-spec-route-service: validates slug before file lookup", async () => {
  let called = false;
  const result = await resolveComponentSpecRequestContext(
    baseArgs({
      routeSlug: " ",
      sanitizeComponentSlugFn: () => "",
      resolveComponentSpecTargetFn: async () => {
        called = true;
        return { ok: true };
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error?.statusCode, 400);
  assert.equal(called, false);
});

test("component-spec-route-service: reports missing component target", async () => {
  const result = await resolveComponentSpecRequestContext(
    baseArgs({
      resolveComponentSpecTargetFn: async () => ({
        ok: false,
        message: "Spec not found",
      }),
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error?.statusCode, 404);
  assert.equal(result.error?.args.code, "component_spec.not_found");
});

test("component-spec-route-service: returns resolved context on success", async () => {
  const result = await resolveComponentSpecRequestContext(baseArgs());
  assert.equal(result.ok, true);
  assert.equal(result.slug, "button");
  assert.equal(result.target?.specRelPath, "docs/_spec/components/button.yml");
});

import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerSystemRoutes } from "./system-routes.mjs";

function createFailJson() {
  return (c, statusCode, args) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createRepository(config) {
  let current = JSON.parse(JSON.stringify(config));
  const saved = [];
  return {
    getConfig: () => JSON.parse(JSON.stringify(current)),
    saveConfig: (next) => {
      current = JSON.parse(JSON.stringify(next));
      saved.push(JSON.parse(JSON.stringify(next)));
      return next;
    },
    getSaved: () => saved,
  };
}

function createBaseDeps(overrides = {}) {
  const repo = createRepository({
    defaultSystem: "core",
    systems: [
      {
        id: "core",
        name: "Core",
        inputDir: "input/core",
        outputDir: "output/core",
        docsDir: "docs/core",
      },
    ],
  });

  return {
    repo,
    deps: {
      buildHealthPayload: () => ({ uptimeMs: 123 }),
      failJson: createFailJson(),
      readJsonBody: async () => ({}),
      designSystemRepository: repo,
      normalizeSystemId: (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      ensureRelativeDir: (value, fallback) => String(value || "").trim() || fallback,
      normalizeFigmaApiTokenRef: (value, fallback = "") => String(value || fallback || ""),
      normalizeCollectionList: (value) => (Array.isArray(value) ? value : []),
      summarizeDesignSystemsConfig: (config) => ({
        systems: config.systems.map((row) => ({ id: row.id, name: row.name })),
        defaultSystem: config.defaultSystem,
      }),
      resolveSafeSystemPathsForDeletion: () => [],
      repoRoot: "/repo",
      fsSync: {
        existsSync: () => false,
        rmSync: () => {},
      },
      ...overrides,
    },
  };
}

function createTestApp(depsOverrides = {}) {
  const { deps, repo } = createBaseDeps(depsOverrides);
  const app = new Hono();
  registerSystemRoutes(app, deps);
  return { app, repo };
}

test("system-routes: health endpoints return payload", async () => {
  const { app } = createTestApp();
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.uptimeMs, 123);
});

test("system-routes: create validates required fields", async () => {
  const { app } = createTestApp({
    readJsonBody: async () => ({ id: "", name: "" }),
  });
  const res = await app.request("/api/design-systems", { method: "POST" });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.missing_required_fields");
});

test("system-routes: create appends system and persists config", async () => {
  const { app, repo } = createTestApp({
    readJsonBody: async () => ({
      id: "Marketing DS",
      name: "Marketing",
      makeDefault: true,
      collections: ["primitives", "semantic"],
    }),
  });
  const res = await app.request("/api/design-systems", { method: "POST" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.system.id, "marketing-ds");
  assert.equal(repo.getSaved().length, 1);
  assert.equal(repo.getSaved()[0].systems.length, 2);
  assert.equal(repo.getSaved()[0].defaultSystem, "marketing-ds");
});

test("system-routes: delete protects last remaining system", async () => {
  const { app } = createTestApp();
  const res = await app.request("/api/design-systems/core", { method: "DELETE" });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "design_system.last_system_protected");
});

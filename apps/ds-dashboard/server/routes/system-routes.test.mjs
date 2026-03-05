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
        mkdirSync: () => {},
        writeFileSync: () => {},
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

test("system-routes: create bootstraps system scaffold artifacts", async () => {
  const existing = new Set();
  const writes = new Map();

  const { app } = createTestApp({
    readJsonBody: async () => ({
      id: "Simple Design System",
      name: "Simple Design System",
    }),
    fsSync: {
      existsSync: (targetPath) => existing.has(targetPath),
      mkdirSync: (targetPath) => {
        existing.add(targetPath);
      },
      writeFileSync: (targetPath, content) => {
        existing.add(targetPath);
        writes.set(targetPath, String(content));
      },
      rmSync: () => {},
    },
  });

  const res = await app.request("/api/design-systems", { method: "POST" });
  assert.equal(res.status, 200);

  const componentRegistryPath = "/repo/docs/simple-design-system/_generated/component-registry.json";
  const tokenRegistryPath = "/repo/docs/simple-design-system/_generated/token-registry.json";
  const overviewPath = "/repo/docs/simple-design-system/components/overview.md";

  assert.ok(writes.has(componentRegistryPath));
  assert.ok(writes.has(tokenRegistryPath));
  assert.ok(writes.has(overviewPath));

  const componentRegistry = JSON.parse(writes.get(componentRegistryPath));
  const tokenRegistry = JSON.parse(writes.get(tokenRegistryPath));
  assert.deepEqual(componentRegistry.components, []);
  assert.deepEqual(tokenRegistry.entries, []);
});

test("system-routes: delete allows removing the last remaining system", async () => {
  const existing = new Set();
  const writes = new Map();

  const { app, repo } = createTestApp({
    fsSync: {
      existsSync: (targetPath) => existing.has(targetPath),
      mkdirSync: (targetPath) => {
        existing.add(targetPath);
      },
      writeFileSync: (targetPath, content) => {
        existing.add(targetPath);
        writes.set(targetPath, String(content));
      },
      rmSync: () => {},
    },
  });
  const res = await app.request("/api/design-systems/core", { method: "DELETE" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(repo.getSaved().length, 1);
  assert.deepEqual(repo.getSaved()[0].systems, []);
  assert.equal(repo.getSaved()[0].defaultSystem, "");
  assert.ok(writes.has("/repo/docs/_generated/component-registry.json"));
  assert.ok(writes.has("/repo/docs/COMPONENTS_INDEX.md"));

  const registry = JSON.parse(writes.get("/repo/docs/_generated/component-registry.json"));
  assert.equal(registry.summary.total_components, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
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
  const systemId = overrides.systemId || "core";
  const repo = createRepository({
    defaultSystem: systemId,
    systems: [
      {
        id: systemId,
        name: systemId.charAt(0).toUpperCase() + systemId.slice(1),
        inputDir: `input/${systemId}`,
        outputDir: `output/${systemId}`,
        docsDir: `docs/${systemId}`,
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
      resolveSafeSystemPathsForDeletion: overrides.resolveSafeSystemPathsForDeletion || (() => []),
      repoRoot: "/repo",
      fsSync: {
        existsSync: () => false,
        mkdirSync: () => {},
        writeFileSync: () => {},
        rmSync: () => {},
        statSync: () => ({ isDirectory: () => true }),
        readdirSync: () => [],
        rmdirSync: () => {},
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

function createDependencyTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE ds_consumers (
      id TEXT PRIMARY KEY,
      ds_file_key TEXT NOT NULL,
      consumer_file_key TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (ds_file_key, consumer_file_key)
    );

    CREATE TABLE ds_sync_runs (
      id TEXT PRIMARY KEY,
      consumer_id TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'partial', 'skipped')),
      error_message TEXT,
      ds_last_modified TEXT,
      consumer_last_modified TEXT,
      component_count INTEGER NOT NULL DEFAULT 0,
      variable_count INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (consumer_id) REFERENCES ds_consumers(id) ON DELETE CASCADE
    );

    CREATE TABLE ds_component_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      component_key TEXT NOT NULL,
      component_name TEXT NOT NULL,
      instance_count INTEGER NOT NULL,
      sample_node_ids_json TEXT,
      FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE ds_variable_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      variable_key TEXT NOT NULL,
      variable_name TEXT NOT NULL,
      variable_type TEXT NOT NULL,
      node_count INTEGER NOT NULL,
      sample_node_ids_json TEXT,
      FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE ds_parent_variable_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ds_file_key TEXT NOT NULL,
      variable_key TEXT NOT NULL,
      variable_name TEXT NOT NULL,
      variable_type TEXT NOT NULL,
      node_count INTEGER NOT NULL,
      sample_node_ids_json TEXT,
      captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (ds_file_key, variable_key)
    );

    CREATE TABLE ds_sync_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      node_id TEXT,
      FOREIGN KEY (run_id) REFERENCES ds_sync_runs(id) ON DELETE CASCADE
    );
  `);
  return db;
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

test("system-routes: delete prunes empty ancestor directories", async () => {
  const existing = new Set([
    "/repo/docs/acme",
    "/repo/docs/acme/_spec",
    "/repo/docs/acme/_spec/components",
    "/repo/input/acme",
    "/repo/output/acme",
  ]);
  const removedPaths = [];
  const prunedDirs = [];
  const writes = new Map();

  const { app, repo } = createTestApp({
    systemId: "acme",
    // Return actual system directory paths (as the real implementation does)
    resolveSafeSystemPathsForDeletion: () => [
      "/repo/docs/acme/_spec/components",
      "/repo/input/acme",
      "/repo/output/acme",
    ],
    fsSync: {
      existsSync: (p) => existing.has(p),
      statSync: () => ({ isDirectory: () => true }),
      readdirSync: (p) => {
        // After deletion, these directories are empty
        if (p === "/repo/docs/acme/_spec/components") return [];
        if (p === "/repo/docs/acme/_spec") return [];
        if (p === "/repo/docs/acme") return [];
        // Protected root has other content
        if (p === "/repo/docs") return [{ name: "other-system" }];
        if (p === "/repo/input") return [{ name: "other-system" }];
        if (p === "/repo/output") return [{ name: "other-system" }];
        return [{ name: "other" }];
      },
      rmSync: (p) => {
        existing.delete(p);
        removedPaths.push(p);
      },
      rmdirSync: (p) => {
        existing.delete(p);
        prunedDirs.push(p);
      },
      // Required for resetGlobalArtifactsForNoSystems when deleting last system
      mkdirSync: (p) => {
        existing.add(p);
      },
      writeFileSync: (p, content) => {
        existing.add(p);
        writes.set(p, String(content));
      },
    },
  });

  const res = await app.request("/api/design-systems/acme", { method: "DELETE" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.prunedEmptyDirs));
  assert.ok(payload.prunedEmptyDirs.length > 0, "Should have pruned some empty directories");
});

test("system-routes: delete-preview returns 404 for non-existent system", async () => {
  const app = new Hono();
  registerSystemRoutes(app, {
    failJson: createFailJson(),
    designSystemRepository: createRepository({
      systems: []
    }),
    db: null,
  });

  const res = await app.request("/api/design-systems/non-existent/delete-preview");
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "design_system.not_found");
});

test("system-routes: delete-preview with empty figmaFileId returns empty", async () => {
  const app = new Hono();
  registerSystemRoutes(app, {
    failJson: createFailJson(),
    designSystemRepository: createRepository({
      systems: [
        { id: "empty-ds", name: "Empty DS", figmaFileId: "" }
      ]
    }),
    db: null,
  });

  const res = await app.request("/api/design-systems/empty-ds/delete-preview");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.consumers.length, 0);
  assert.equal(payload.data.counts.syncRuns, 0);
});

test("system-routes: delete-preview without db returns empty", async () => {
  const app = new Hono();
  registerSystemRoutes(app, {
    failJson: createFailJson(),
    designSystemRepository: createRepository({
      systems: [
        { id: "test-ds", name: "Test DS", figmaFileId: "figma123" }
      ]
    }),
    db: null,
  });

  const res = await app.request("/api/design-systems/test-ds/delete-preview");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.consumers.length, 0);
  assert.equal(payload.data.counts.syncRuns, 0);
});

test("system-routes: delete-preview with real consumers returns data", async () => {
  const db = createDependencyTestDb();
  try {
    const { DependencyRepository } = await import("../db/dependency-repository.ts");
    const dependencyRepo = new DependencyRepository(db);
    const firstConsumer = dependencyRepo.addConsumer({
      ds_file_key: "figma123",
      consumer_file_key: "consumer-file-1",
      consumer_name: "Test Consumer",
    });
    const secondConsumer = dependencyRepo.addConsumer({
      ds_file_key: "figma123",
      consumer_file_key: "consumer-file-2",
      consumer_name: "Another Consumer",
    });
    dependencyRepo.saveSyncRun({
      consumer_id: firstConsumer.id,
      duration_ms: 100,
      status: "ok",
      component_usage: [
        {
          component_key: "button",
          component_name: "Button",
          instance_count: 2,
        },
      ],
      variable_usage: [
        {
          variable_key: "color.primary",
          variable_name: "color.primary",
          variable_type: "COLOR",
          node_count: 1,
        },
      ],
      warnings: [],
    });
    dependencyRepo.saveSyncRun({
      consumer_id: secondConsumer.id,
      duration_ms: 120,
      status: "partial",
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });
    dependencyRepo.replaceParentVariableUsage("figma123", [
      {
        variable_key: "space.4",
        variable_name: "space.4",
        variable_type: "FLOAT",
        node_count: 3,
      },
    ]);

    const app = new Hono();
    registerSystemRoutes(app, {
      failJson: createFailJson(),
      designSystemRepository: createRepository({
        systems: [
          { id: "test-ds", name: "Test DS", figmaFileId: "figma123" }
        ]
      }),
      db,
    });

    const res = await app.request("/api/design-systems/test-ds/delete-preview");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.system.id, "test-ds");
    assert.equal(payload.data.system.name, "Test DS");
    assert.equal(payload.data.totalConsumerCount, 2);
    assert.equal(payload.data.consumers.length, 2);
    assert.equal(payload.data.counts.syncRuns, 2);
    assert.equal(payload.data.counts.componentUsage, 1);
    assert.equal(payload.data.counts.variableUsage, 1);
    assert.equal(payload.data.counts.parentVariableUsage, 1);
  } finally {
    db.close();
  }
});

test("system-routes: delete cascade with real db cleans consumers", async () => {
  const db = createDependencyTestDb();
  try {
    const { DependencyRepository } = await import("../db/dependency-repository.ts");
    const dependencyRepo = new DependencyRepository(db);
    const firstConsumer = dependencyRepo.addConsumer({
      ds_file_key: "figma123",
      consumer_file_key: "consumer-file-1",
      consumer_name: "Consumer One",
    });
    const secondConsumer = dependencyRepo.addConsumer({
      ds_file_key: "figma123",
      consumer_file_key: "consumer-file-2",
      consumer_name: "Consumer Two",
    });
    dependencyRepo.saveSyncRun({
      consumer_id: firstConsumer.id,
      duration_ms: 50,
      status: "ok",
      component_usage: [],
      variable_usage: [],
      warnings: [],
    });
    dependencyRepo.saveSyncRun({
      consumer_id: secondConsumer.id,
      duration_ms: 75,
      status: "error",
      component_usage: [],
      variable_usage: [],
      warnings: [
        {
          code: "sync.error",
          message: "sync failed",
        },
      ],
    });

    const app = new Hono();
    registerSystemRoutes(app, {
      failJson: createFailJson(),
      designSystemRepository: createRepository({
        systems: [
          { id: "test-ds", name: "Test DS", figmaFileId: "figma123" }
        ],
        defaultSystem: "test-ds",
      }),
      db,
      repoRoot: "/repo",
      fsSync: {
        rmSync: () => {},
        rmdirSync: () => {},
        existsSync: () => false,
        mkdirSync: () => {},
        writeFileSync: () => {},
        statSync: () => ({ isDirectory: () => true }),
        readdirSync: () => [],
      },
      resolveSafeSystemPathsForDeletion: () => [],
      summarizeDesignSystemsConfig: () => ({ systems: [], defaultSystem: "" }),
      normalizeSystemId: (id) => id,
      ensureRelativeDir: (path) => path,
      normalizeFigmaApiTokenRef: (token) => token,
      normalizeCollectionList: (collections) => collections,
    });

    const res = await app.request("/api/design-systems/test-ds", { method: "DELETE" });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.deletedConsumersCount, 2);
    assert.deepEqual(payload.deletedConsumerNames.sort(), ["Consumer One", "Consumer Two"]);

    const remainingConsumers = db
      .prepare("SELECT COUNT(*) AS count FROM ds_consumers WHERE ds_file_key = ?")
      .get("figma123");
    assert.equal(remainingConsumers.count, 0);
  } finally {
    db.close();
  }
});

test("system-routes: delete without db does not fail", async () => {
  const existing = new Set();
  const writes = new Map();

  const app = new Hono();
  registerSystemRoutes(app, {
    failJson: createFailJson(),
    designSystemRepository: createRepository({
      systems: [
        { id: "test-ds", name: "Test DS", figmaFileId: "figma123" }
      ]
    }),
    db: null,
    repoRoot: "/repo",
    fsSync: {
      rmSync: () => {},
      rmdirSync: () => {},
      existsSync: () => false,
      mkdirSync: () => {},
      writeFileSync: () => {},
    },
    resolveSafeSystemPathsForDeletion: () => [],
    summarizeDesignSystemsConfig: () => ({ systems: [], defaultSystem: "" }),
    normalizeSystemId: (id) => id,
    ensureRelativeDir: (path) => path,
    normalizeFigmaApiTokenRef: (token) => token,
    normalizeCollectionList: (collections) => collections,
  });

  const res = await app.request("/api/design-systems/test-ds", { method: "DELETE" });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.deletedConsumersCount, undefined);
  assert.equal(payload.deletedConsumerNames, undefined);
});

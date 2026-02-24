import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { registerHealthRoutes } from "./health-routes.mjs";

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

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-health-routes-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function createTestApp(sysCtx) {
  const app = new Hono();
  registerHealthRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => sysCtx,
  });
  return app;
}

test("health-routes: /api/token-health returns bootstrap payload when artifact is missing", async () => {
  await withTempDir(async (dir) => {
    const app = createTestApp({
      tokenHealthPath: path.join(dir, "missing-token-health.json"),
      tokenRegistryPath: path.join(dir, "token-registry.json"),
      tokenUsageIndexPath: path.join(dir, "token-usage-index.json"),
      tokenGraphVizPath: path.join(dir, "token-graph-viz.json"),
      wcagPairsPath: path.join(dir, "wcag-pairs.json"),
      componentsHealthPath: path.join(dir, "components-health.json"),
      healthHistoryPath: path.join(dir, "health-history.json"),
      componentRegistryPath: path.join(dir, "component-registry.json"),
    });

    const res = await app.request("/api/token-health");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.bootstrapped, true);
    assert.equal(payload.summary.tokens_total, 0);
  });
});

test("health-routes: /api/components-health returns artifact value when present", async () => {
  await withTempDir(async (dir) => {
    const componentsHealthPath = path.join(dir, "components-health.json");
    const artifact = {
      ok: true,
      schema_version: 1,
      summary: { total_components: 2 },
    };
    await fs.writeFile(componentsHealthPath, JSON.stringify(artifact), "utf8");

    const app = createTestApp({
      tokenHealthPath: path.join(dir, "token-health.json"),
      tokenRegistryPath: path.join(dir, "token-registry.json"),
      tokenUsageIndexPath: path.join(dir, "token-usage-index.json"),
      tokenGraphVizPath: path.join(dir, "token-graph-viz.json"),
      wcagPairsPath: path.join(dir, "wcag-pairs.json"),
      componentsHealthPath,
      healthHistoryPath: path.join(dir, "health-history.json"),
      componentRegistryPath: path.join(dir, "component-registry.json"),
    });

    const res = await app.request("/api/components-health");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.total_components, 2);
  });
});

test("health-routes: /api/health-history filters snapshots by range", async () => {
  await withTempDir(async (dir) => {
    const healthHistoryPath = path.join(dir, "health-history.json");
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(
      healthHistoryPath,
      JSON.stringify({
        schema_version: 1,
        snapshots: [
          { captured_at: fortyDaysAgo, metrics: {}, fingerprints: {}, meta: {} },
          { captured_at: twoDaysAgo, metrics: {}, fingerprints: {}, meta: {} },
        ],
      }),
      "utf8",
    );

    const app = createTestApp({
      tokenHealthPath: path.join(dir, "token-health.json"),
      tokenRegistryPath: path.join(dir, "token-registry.json"),
      tokenUsageIndexPath: path.join(dir, "token-usage-index.json"),
      tokenGraphVizPath: path.join(dir, "token-graph-viz.json"),
      wcagPairsPath: path.join(dir, "wcag-pairs.json"),
      componentsHealthPath: path.join(dir, "components-health.json"),
      healthHistoryPath,
      componentRegistryPath: path.join(dir, "component-registry.json"),
    });

    const res = await app.request("/api/health-history?range=7d");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.range, "7d");
    assert.equal(payload.snapshots.length, 1);
    assert.equal(payload.summary.snapshots_total, 1);
  });
});

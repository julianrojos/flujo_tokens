import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { registerAnalysisRoutes } from "./analysis-routes.mjs";

function createFailJson() {
  return (c: any, statusCode: number, args: any) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-analysis-routes-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function createTestApp(getSystemContext: () => any) {
  const app = new Hono();
  registerAnalysisRoutes(app, {
    failJson: createFailJson(),
    getSystemContext,
  });
  return app;
}

test("analysis-routes: /api/token-diff validates beforeRef", async () => {
  const app = createTestApp(() => ({
    repoRoot: "/repo",
    tokenDiffScriptPath: "tooling/scripts/ds-token-diff.mjs",
    systemId: "core",
  }));
  const res = await app.request("/api/token-diff?beforeRef=bad ref");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.invalid_git_ref");
});

test("analysis-routes: /api/naming-debt returns cached payload when refresh is false", async () => {
  await withTempDir(async (dir) => {
    const namingDebtCachePath = path.join(dir, "naming-debt.json");
    const cached = {
      ok: true,
      generatedAt: "2026-02-24T00:00:00.000Z",
      summary: { debtScore: 10 },
    };
    await fs.writeFile(namingDebtCachePath, JSON.stringify(cached), "utf8");
    const app = createTestApp(() => ({
      namingDebtCachePath,
      tokenRegistryPath: path.join(dir, "token-registry.json"),
      tokenUsageIndexPath: path.join(dir, "token-usage-index.json"),
      tokenGraphVizPath: path.join(dir, "token-graph-viz.json"),
      namingDebtConfigPath: path.join(dir, "naming-debt-config.json"),
    }));

    const res = await app.request("/api/naming-debt");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.summary.debtScore, 10);
  });
});

test("analysis-routes: /api/impact requires tokenPath", async () => {
  const app = createTestApp(() => ({
    repoRoot: "/repo",
    tokenRegistryPath: "/repo/token-registry.json",
    tokenGraphVizPath: "/repo/token-graph-viz.json",
    tokenUsageIndexPath: "/repo/token-usage-index.json",
    tokenHealthPath: "/repo/token-health.json",
    componentRegistryPath: "/repo/component-registry.json",
    wcagPairsPath: "/repo/wcag-pairs.json",
  }));
  const res = await app.request("/api/impact");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.token_path_required");
});

import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerCommandRoutes } from "./command-routes.mjs";

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

function createBaseDeps(overrides = {}) {
  return {
    failJson: createFailJson(),
    createApiRequestId: () => "req_test",
    readJsonBody: async () => ({}),
    getSystemContext: () => ({
      repoRoot: "/repo",
      systemId: "core",
      healthSnapshotScriptPath: "tooling/scripts/ds-health-snapshot.mjs",
      tokensFromFigmaScriptPath: "tooling/scripts/ds-tokens-from-figma.mjs",
      captureFromFigmaUrlScriptPath: "tooling/scripts/ds-capture-from-figma-url.mjs",
    }),
    queueJobAcceptedPayload: (job) => ({ ok: true, jobId: job.id }),
    enqueueQueueJob: () => ({ id: "queued_1" }),
    sha256Text: () => "hash",
    runQueuedSpawnCommand: async () => ({ ok: true }),
    queueNpmScript: () => ({ id: "npm_job" }),
    enqueueRefreshNamingDebtJob: () => ({ id: "naming_job" }),
    queueNodeJsonCommand: () => ({ id: "node_job" }),
    toBooleanString: (value, fallback) => {
      if (typeof value === "boolean") return value ? "true" : "false";
      return fallback ? "true" : "false";
    },
    toNumberString: (value, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return String(fallback);
      return String(Math.floor(n));
    },
    validateGitRef: (value) => String(value || ""),
    ...overrides,
  };
}

function createTestApp(depsOverrides = {}) {
  const app = new Hono();
  registerCommandRoutes(app, createBaseDeps(depsOverrides));
  return app;
}

test("command-routes: /api/run rejects missing script name", async () => {
  const app = createTestApp();
  const res = await app.request("/api/run/%20", { method: "POST" });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "validation.missing_script_name");
});

test("command-routes: /api/refresh-registry enqueues expected script", async () => {
  const captured = [];
  const app = createTestApp({
    queueNpmScript: (args) => {
      captured.push(args);
      return { id: "registry_job" };
    },
  });

  const res = await app.request("/api/refresh-registry", {
    method: "POST",
    headers: { "x-ds-system": "core" },
  });
  assert.equal(res.status, 202);
  const payload = await res.json();
  assert.deepEqual(payload, { ok: true, jobId: "registry_job" });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].script, "ds:registry:refresh");
  assert.equal(captured[0].systemId, "core");
});

test("command-routes: /api/capture-health-snapshot validates git ref", async () => {
  const app = createTestApp({
    readJsonBody: async () => ({ beforeRef: "bad-ref" }),
    validateGitRef: () => null,
  });
  const res = await app.request("/api/capture-health-snapshot", { method: "POST" });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.invalid_git_ref");
});

test("command-routes: /api/capture-figma-screenshot requires figmaUrl", async () => {
  const app = createTestApp({
    readJsonBody: async () => ({}),
  });
  const res = await app.request("/api/capture-figma-screenshot", { method: "POST" });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.figma_url_required");
});

test("command-routes: /api/capture-figma-screenshot enqueues redacted command", async () => {
  const calls = [];
  const app = createTestApp({
    readJsonBody: async () => ({
      figmaUrl: "https://www.figma.com/file/abc123/test",
      figmaToken: "secret-token",
      dryRun: true,
    }),
    queueNodeJsonCommand: (args) => {
      calls.push(args);
      return { id: "capture_job" };
    },
  });

  const res = await app.request("/api/capture-figma-screenshot", { method: "POST" });
  assert.equal(res.status, 202);
  const payload = await res.json();
  assert.deepEqual(payload, { ok: true, jobId: "capture_job" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].commandLabel, /\*\*\*redacted\*\*\*/);
  assert.ok(calls[0].scriptArgs.includes("secret-token"));
});

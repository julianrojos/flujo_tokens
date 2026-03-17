import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createServerApp } from './create-server-app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

test("create-server-app: boots health routes and supports idempotent dispose", async () => {
  const previousInternalUrl = process.env.DS_DASHBOARD_INTERNAL_URL;
  const previousInternalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  try {
    const { app, port, host, disposeDesignSystemRepository } = createServerApp({
      env: {
        ...process.env,
        DS_DASHBOARD_API_PORT: "9991",
        FIGMA_MCP_COMMAND: "__ds_dashboard_test_invalid_mcp_command__",
      },
      repoRoot,
      watch: false,
    });

    assert.equal(port, 9991);
    assert.equal(host, "127.0.0.1");
    assert.equal(process.env.DS_DASHBOARD_INTERNAL_URL, "http://127.0.0.1:9991");
    assert.equal(typeof process.env.DS_DASHBOARD_INTERNAL_TOKEN, "string");
    assert.equal(Boolean(String(process.env.DS_DASHBOARD_INTERNAL_TOKEN || "").trim()), true);

    const healthRes = await app.request("http://localhost/health");
    assert.equal(healthRes.status, 200);
    const healthPayload = (await healthRes.json()) as {
      ok: boolean;
      status: string;
      now: unknown;
    };
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.status, "ok");
    assert.equal(typeof healthPayload.now, "string");

    const apiHealthRes = await app.request("http://localhost/api/health");
    assert.equal(apiHealthRes.status, 200);
    const apiHealthPayload = (await apiHealthRes.json()) as {
      status: string;
      queue: unknown;
    };
    assert.equal(apiHealthPayload.status, "ok");
    assert.equal(typeof apiHealthPayload.queue, "object");

    assert.doesNotThrow(() => disposeDesignSystemRepository());
    assert.doesNotThrow(() => disposeDesignSystemRepository());
  } finally {
    if (previousInternalUrl === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_URL;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_URL = previousInternalUrl;
    }
    if (previousInternalToken === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = previousInternalToken;
    }
  }
});

test("create-server-app: brackets IPv6 host in DS_DASHBOARD_INTERNAL_URL", () => {
  const previousInternalUrl = process.env.DS_DASHBOARD_INTERNAL_URL;
  const previousInternalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;
  try {
    const { host, disposeDesignSystemRepository } = createServerApp({
      env: {
        ...process.env,
        DS_DASHBOARD_API_PORT: "9992",
        DS_DASHBOARD_API_HOST: "::1",
        FIGMA_MCP_COMMAND: "__ds_dashboard_test_invalid_mcp_command__",
      },
      repoRoot,
      watch: false,
    });

    assert.equal(host, "::1");
    assert.equal(process.env.DS_DASHBOARD_INTERNAL_URL, "http://[::1]:9992");

    assert.doesNotThrow(() => disposeDesignSystemRepository());
  } finally {
    if (previousInternalUrl === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_URL;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_URL = previousInternalUrl;
    }
    if (previousInternalToken === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = previousInternalToken;
    }
  }
});

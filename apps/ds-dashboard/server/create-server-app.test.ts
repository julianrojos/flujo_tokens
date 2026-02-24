import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createServerApp } from "./create-server-app.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

test("create-server-app: boots health routes and supports idempotent dispose", async () => {
  const { app, port, disposeDesignSystemRepository } = createServerApp({
    env: {
      ...process.env,
      DS_DASHBOARD_API_PORT: "9991",
    },
    repoRoot,
    watch: false,
  });

  assert.equal(port, 9991);

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
});

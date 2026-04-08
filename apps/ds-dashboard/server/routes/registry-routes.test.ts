import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerRegistryRoutes } from "./registry-routes.mjs";

function createFailJson() {
  return (c: any, statusCode: number, args: Record<string, unknown>) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createTestApp(componentRepoOverrides: Record<string, unknown> = {}) {
  const app = new Hono();
  registerRegistryRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ systemId: "sys-01", repoRoot: "/repo" }),
    componentRepo: {
      getAll: () => [],
      getEditorialByComponentIds: () => new Map(),
      ...componentRepoOverrides,
    },
    tokenRepo: {
      getTokenRegistry: () => ({ entries: [] }),
    },
  });
  return app;
}

test("registry-routes: /api/component-usage-index builds db:// usage graph from related_components", async () => {
  const app = createTestApp({
    getAll: () => [
      { id: 1, slug: "button" },
      { id: 2, slug: "icon" },
    ],
    getEditorialByComponentIds: () =>
      new Map([
        [1, { relatedComponents: ["icon"] }],
      ]),
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.deepEqual(payload.by_slug.button.uses, ["icon"]);
  assert.deepEqual(payload.by_slug.icon.used_in, ["button"]);
});

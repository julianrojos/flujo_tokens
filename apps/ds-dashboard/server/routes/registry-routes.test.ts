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
      getAnatomySpecsByComponentIds: () => new Map(),
      ...componentRepoOverrides,
    },
    tokenRepo: {
      getTokenRegistry: () => ({ entries: [] }),
    },
  });
  return app;
}

test("registry-routes: /api/component-usage-index builds db:// usage graph with related_components + anatomy", async () => {
  const app = createTestApp({
    getAll: () => [
      { id: 1, slug: "button" },
      { id: 2, slug: "icon" },
      { id: 3, slug: "list_item" },
    ],
    getEditorialByComponentIds: () =>
      new Map([
        [1, { relatedComponents: ["icon"] }],
      ]),
    getAnatomySpecsByComponentIds: () =>
      new Map([
        [1, { anatomy: [{ id: "list_items" }] }],
      ]),
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.deepEqual(payload.by_slug.button.uses, ["icon", "list_item"]);
  assert.deepEqual(payload.by_slug.icon.used_in, ["button"]);
  assert.deepEqual(payload.by_slug.list_item.used_in, ["button"]);
});

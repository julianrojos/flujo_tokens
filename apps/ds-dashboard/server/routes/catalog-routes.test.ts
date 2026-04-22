import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerCatalogRoutes } from "./catalog-routes.mjs";

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

function createTestApp(
  componentRepoOverrides: Record<string, unknown> = {},
  options: { repoRoot?: string; systemId?: string } = {},
) {
  const systemId = options.systemId ?? "sys-01";
  const repoRoot = options.repoRoot ?? "/repo";
  const app = new Hono();
  registerCatalogRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ systemId, repoRoot }),
    componentRepo: {
      getAll: () => [],
      getEditorialByComponentIds: () => new Map(),
      ...componentRepoOverrides,
    },
    tokenRepo: {
      getTokenCatalog: () => ({ entries: [] }),
    },
  });
  return app;
}

test("catalog-routes: /api/component-usage-index returns empty graph for components without figma relations", async () => {
  const app = createTestApp({
    getAll: () => [
      { id: 1, slug: "button" },
      { id: 2, slug: "icon" },
    ],
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.deepEqual(payload.by_slug.button.uses, []);
  assert.deepEqual(payload.by_slug.icon.used_in, []);
});

test("catalog-routes: /api/component-usage-index resolves figma instance dependencies", async () => {
  const app = createTestApp({
    getAll: () => [
      {
        id: 1,
        slug: "calendar",
        figmaComponentSetNodeId: "4333:9262",
        figma: {
          variants: [{ name: "Default", properties: {}, nodeId: "4333:9286" }],
          instanceDependencies: [
            {
              instanceNodeId: "4333:9999",
              instanceNodeName: "Calendar Select Group",
              usedComponentNodeId: "4333:9286",
              usedComponentName: "Calendar Button",
              status: "resolved",
            },
          ],
        },
      },
      {
        id: 2,
        slug: "calendar-button",
        figmaComponentSetNodeId: "4333:9286",
        figma: {
          variants: [{ name: "Default", properties: {}, nodeId: "4333:9287" }],
        },
      },
    ],
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.deepEqual(payload.by_slug.calendar.uses, ["calendar-button"]);
  assert.deepEqual(payload.by_slug["calendar-button"].used_in, ["calendar"]);
});

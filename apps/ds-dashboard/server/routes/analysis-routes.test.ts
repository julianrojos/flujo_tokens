import assert from "node:assert/strict";
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

function createTestApp(args: {
  getSystemContext: () => any;
  tokenRepo?: {
    getTokenRegistry: (dsId: string) => any;
    getTokenUsageIndex: (dsId: string) => any;
    getTokenGraph: (dsId: string) => any;
  };
}) {
  const app = new Hono();
  registerAnalysisRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: args.getSystemContext,
    tokenRepo: args.tokenRepo,
  });
  return app;
}

test("analysis-routes: /api/naming-debt returns computed payload from DB artifacts", async () => {
  const app = createTestApp({
    getSystemContext: () => ({
      systemId: "sys-01",
      wcagPairs: { pairs: [] },
      namingDebtConfig: {},
    }),
    tokenRepo: {
      getTokenRegistry: () => ({
        entries: [
          {
            path: "color.brand.primary",
            slashPath: "color/brand/primary",
            cssVar: "--color-brand-primary",
            type: "color",
            resolvedValue: "#000000",
            collection: "primitives",
          },
        ],
      }),
      getTokenUsageIndex: () => ({
        entries: [],
        byPath: {},
        bySlashPath: {},
        byCssVar: {},
        summary: {},
      }),
      getTokenGraph: () => ({
        nodes: [],
        edges: [],
        cycles: [],
        cycle_node_ids: [],
        summary: {},
      }),
    },
  });

  const res = await app.request("/api/naming-debt");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.ok(payload && typeof payload === "object");
  assert.ok("summary" in payload);
});

test("analysis-routes: /api/impact requires tokenPath", async () => {
  const app = createTestApp({
    getSystemContext: () => ({
      systemId: "sys-01",
      wcagPairs: { pairs: [] },
      namingDebtConfig: {},
    }),
    tokenRepo: {
      getTokenRegistry: () => ({ entries: [] }),
      getTokenUsageIndex: () => ({ entries: [], byPath: {}, bySlashPath: {}, byCssVar: {} }),
      getTokenGraph: () => ({ nodes: [], edges: [], cycles: [], cycle_node_ids: [], summary: {} }),
    },
  });
  const res = await app.request("/api/impact");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.token_path_required");
});

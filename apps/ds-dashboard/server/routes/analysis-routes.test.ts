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

test("analysis-routes: /api/impact requires tokenPath", async () => {
  const app = createTestApp({
    getSystemContext: () => ({
      systemId: "sys-01",
      wcagPairs: { pairs: [] },
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

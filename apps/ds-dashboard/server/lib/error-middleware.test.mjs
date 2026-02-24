import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerUnhandledErrorMiddleware } from "./error-middleware.mjs";

test("error-middleware: maps thrown errors to failJson and logs context", async () => {
  const logged = [];
  const app = new Hono();

  registerUnhandledErrorMiddleware(app, {
    createApiRequestId: () => "req_fixed",
    writeStructuredLog: (level, payload) => {
      logged.push({ level, payload });
    },
    failJson: (c, statusCode, args) =>
      c.json(
        {
          ok: false,
          statusCode,
          code: args.code,
          requestId: args.requestId,
        },
        statusCode,
      ),
  });

  app.get("/boom", () => {
    throw new Error("boom");
  });

  const res = await app.request("/boom");
  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "internal.unexpected_error");
  assert.equal(payload.requestId, "req_fixed");

  assert.equal(logged.length, 1);
  assert.equal(logged[0].level, "error");
  assert.equal(logged[0].payload.path, "/boom");
});

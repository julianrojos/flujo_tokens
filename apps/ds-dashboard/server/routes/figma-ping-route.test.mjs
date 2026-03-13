import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import { registerFigmaPingRoute } from "./figma-ping-route.mjs";

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

function createTestApp() {
  const app = new Hono();
  registerFigmaPingRoute(app, {
    failJson: createFailJson(),
    readJsonBody: async (c) => await c.req.json(),
  });
  return app;
}

test("figma-ping-route: rejects non-figma hosts", async () => {
  const app = createTestApp();
  const response = await app.request("/api/figma-ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      figmaUrl: "https://example.com/design/abc123/Test",
      figmaToken: "figd_test",
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, "ping.invalid_host");
});

test("figma-ping-route: returns env-var-not-set when token reference is unresolved", async () => {
  const app = createTestApp();
  const response = await app.request("/api/figma-ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      figmaUrl: "https://www.figma.com/design/abc123/Test",
      figmaToken: "${FIGMA_TOKEN_NOT_SET}",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "ping.env_var_not_set");
  assert.equal(payload.fileKey, "abc123");
});

test("figma-ping-route: returns success payload for readable file", async () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ name: "Simple DS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const response = await app.request("/api/figma-ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: "https://www.figma.com/design/abc123/Test",
        figmaToken: "figd_test",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.fileName, "Simple DS");
    assert.equal(payload.fileKey, "abc123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("figma-ping-route: maps timeout-like fetch failures to ping.timeout", async (t) => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const timeoutNames = ["TimeoutError", "AbortError"];
  for (const errorName of timeoutNames) {
    await t.test(`fetch error name=${errorName}`, async () => {
      globalThis.fetch = async () => {
        const err = new Error("simulated timeout");
        err.name = errorName;
        throw err;
      };

      const response = await app.request("/api/figma-ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUrl: "https://www.figma.com/design/abc123/Test",
          figmaToken: "figd_test",
        }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.code, "ping.timeout");
    });
  }
});

test("figma-ping-route: maps generic fetch failure to ping.network_error", async () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simulated network failure");
  };

  try {
    const response = await app.request("/api/figma-ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: "https://www.figma.com/design/abc123/Test",
        figmaToken: "figd_test",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "ping.network_error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("figma-ping-route: resolves plain env-var token name when it exists", async () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  const envKey = "FIGMA_PING_ROUTE_TEST_TOKEN";
  const previousEnv = process.env[envKey];
  process.env[envKey] = "figd_from_env";

  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init?.headers ?? {});
    assert.equal(headers.get("X-Figma-Token"), "figd_from_env");
    return new Response(JSON.stringify({ name: "Simple DS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await app.request("/api/figma-ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: "https://www.figma.com/design/abc123/Test",
        figmaToken: envKey,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = previousEnv;
    }
  }
});

test("figma-ping-route: allows creation when variables REST scope is missing and signals MCP fallback", async () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url || "");
    if (href.includes("/variables/local")) {
      return new Response(
        JSON.stringify({
          err: true,
          message:
            "Invalid scope(s): file_content:read. This endpoint requires the file_variables:read scope.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ name: "Simple DS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await app.request("/api/figma-ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: "https://www.figma.com/design/abc123/Test",
        figmaToken: "figd_test",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.code, "figma.variables_scope_missing");
    assert.equal(payload.fileName, "Simple DS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("figma-ping-route: reports variables endpoint failures even when file read succeeds", async () => {
  const app = createTestApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url || "");
    if (href.includes("/variables/local")) {
      return new Response(JSON.stringify({ err: "forbidden", message: "Denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ name: "Simple DS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await app.request("/api/figma-ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        figmaUrl: "https://www.figma.com/design/abc123/Test",
        figmaToken: "figd_test",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "figma.variables.403");
    assert.match(String(payload.message || ""), /variables endpoint returned HTTP 403/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

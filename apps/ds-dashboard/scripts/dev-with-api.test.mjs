import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyApiPort,
  resolveApiRuntimeConfig,
} from "./dev-with-api.mjs";

test("resolveApiRuntimeConfig uses fixed default port", () => {
  const config = resolveApiRuntimeConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.apiBaseUrl, "http://127.0.0.1:8787");
});

test("resolveApiRuntimeConfig parses explicit DS_DASHBOARD_API_URL", () => {
  const config = resolveApiRuntimeConfig({
    DS_DASHBOARD_API_URL: "http://localhost:9223/",
  });
  assert.equal(config.host, "localhost");
  assert.equal(config.port, 9223);
  assert.equal(config.apiBaseUrl, "http://localhost:9223");
});

test("resolveApiRuntimeConfig falls back when DS_DASHBOARD_API_URL is invalid", () => {
  const config = resolveApiRuntimeConfig({
    DS_DASHBOARD_API_URL: "not-a-valid-url",
    DS_DASHBOARD_API_HOST: "localhost",
    DS_DASHBOARD_API_PORT: "9001",
  });

  assert.equal(config.host, "localhost");
  assert.equal(config.port, 9001);
  assert.equal(config.apiBaseUrl, "http://localhost:9001");
  assert.equal(config.explicitUrl, false);
});

test("resolveApiRuntimeConfig falls back when DS_DASHBOARD_API_PORT is out of range", () => {
  const config = resolveApiRuntimeConfig({
    DS_DASHBOARD_API_HOST: "localhost",
    DS_DASHBOARD_API_PORT: "70000",
  });

  assert.equal(config.host, "localhost");
  assert.equal(config.port, 8787);
  assert.equal(config.apiBaseUrl, "http://localhost:8787");
});

test("classifyApiPort returns already-running when health endpoint is dashboard", async () => {
  const status = await classifyApiPort({
    host: "127.0.0.1",
    port: 8787,
    apiHealthUrl: "http://127.0.0.1:8787/api/health",
    isPortAvailableFn: async () => false,
    fetchFn: async () => ({
      ok: true,
      json: async () => ({ status: "ok", service: "ds-dashboard-api" }),
    }),
  });
  assert.equal(status.kind, "already-running");
});

test("classifyApiPort returns occupied for non-dashboard service", async () => {
  const status = await classifyApiPort({
    host: "127.0.0.1",
    port: 8787,
    apiHealthUrl: "http://127.0.0.1:8787/api/health",
    isPortAvailableFn: async () => false,
    fetchFn: async () => ({
      ok: true,
      json: async () => ({ status: "ok", service: "another-service" }),
    }),
  });
  assert.equal(status.kind, "occupied");
});

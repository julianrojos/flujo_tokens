import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DATABASE_URL,
  isLocalDatabaseUrl,
  parseDatabaseUrl,
  resolveDashboardDatabaseUrl,
  shouldSkipDatabasePreflight,
} from "./dev-db.mjs";

test("resolveDashboardDatabaseUrl prefers DATABASE_URL over TEST_DATABASE_URL", () => {
  assert.equal(
    resolveDashboardDatabaseUrl({
      TEST_DATABASE_URL: "postgres://test:test@localhost:5432/test_db",
      DATABASE_URL: "postgres://db:db@localhost:5432/main_db",
    }),
    "postgres://db:db@localhost:5432/main_db",
  );
});

test("resolveDashboardDatabaseUrl falls back to the local default", () => {
  assert.equal(resolveDashboardDatabaseUrl({}), DEFAULT_DATABASE_URL);
});

test("parseDatabaseUrl extracts host and port", () => {
  assert.deepEqual(
    parseDatabaseUrl("postgres://user:pass@[::1]:5432/db"),
    {
      url: "postgres://user:pass@[::1]:5432/db",
      host: "::1",
      port: 5432,
    },
  );
});

test("isLocalDatabaseUrl only accepts loopback postgres URLs on 5432", () => {
  assert.equal(isLocalDatabaseUrl("postgres://user:pass@localhost:5432/db"), true);
  assert.equal(isLocalDatabaseUrl("postgres://user:pass@localhost:5433/db"), false);
  assert.equal(isLocalDatabaseUrl("postgres://user:pass@db.internal:5432/db"), false);
});

test("shouldSkipDatabasePreflight only returns true for supervised runs", () => {
  assert.equal(shouldSkipDatabasePreflight({ DS_DASHBOARD_SUPERVISED: "1" }), true);
  assert.equal(shouldSkipDatabasePreflight({ DS_DASHBOARD_SUPERVISED: "true" }), true);
  assert.equal(shouldSkipDatabasePreflight({ DS_DASHBOARD_SUPERVISED: "0" }), false);
  assert.equal(shouldSkipDatabasePreflight({}), false);
});

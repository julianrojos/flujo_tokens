import assert from "node:assert/strict";
import test from "node:test";

import {
  createDevRuntimeChecker,
  createSha256TextHasher,
  createSystemContextResolver,
} from "./create-server-runtime-utils.mjs";

test("create-server-runtime-utils: createDevRuntimeChecker reads NODE_ENV", () => {
  const isDev = createDevRuntimeChecker({ NODE_ENV: "development" });
  const isProd = createDevRuntimeChecker({ NODE_ENV: "production" });

  assert.equal(isDev(), true);
  assert.equal(isProd(), false);
});

test("create-server-runtime-utils: createSha256TextHasher returns deterministic hashes", () => {
  const hashText = createSha256TextHasher();
  assert.equal(hashText("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(hashText("abc"), hashText("abc"));
});

test("create-server-runtime-utils: createSystemContextResolver delegates to repository", () => {
  const calls = [];
  const resolver = createSystemContextResolver({
    resolveDashboardSystemContext(systemHeader) {
      calls.push(systemHeader);
      return { systemId: "core", header: systemHeader };
    },
  });

  const resolved = resolver("core");
  assert.deepEqual(resolved, { systemId: "core", header: "core" });
  assert.deepEqual(calls, ["core"]);
});

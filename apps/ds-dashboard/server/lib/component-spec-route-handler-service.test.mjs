import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComponentSpecGetPayload,
  buildRestoreComponentSpecRouteArgs,
  buildSaveComponentSpecRouteArgs,
  buildValidateComponentSpecRouteArgs,
} from "./component-spec-route-handler-service.mjs";

test("component-spec-route-handler-service: buildComponentSpecGetPayload keeps response shape", () => {
  const payload = buildComponentSpecGetPayload({
    slug: "button",
    specRelPath: "docs/_spec/components/button.yml",
    exists: true,
    raw: "name: button\nstatus: draft\n",
    parseYamlSafelyFn: () => ({ parsed: { name: "button" }, parseError: null }),
    sha256TextFn: () => "hash",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.slug, "button");
  assert.equal(payload.path, "docs/_spec/components/button.yml");
  assert.equal(payload.rawHash, "hash");
  assert.deepEqual(payload.parsed, { name: "button" });
});

test("component-spec-route-handler-service: validate args normalize raw", () => {
  const args = buildValidateComponentSpecRouteArgs({
    slug: "button",
    specRelPath: "docs/_spec/components/button.yml",
    specAbsPath: "/repo/docs/_spec/components/button.yml",
    tokenRegistryPath: "/repo/docs/_generated/token-registry.json",
    maxBytes: 500_000,
    body: {},
  });
  assert.equal(args.raw, "");
  assert.equal(args.maxBytes, 500_000);
});

test("component-spec-route-handler-service: save args normalize flags and expectedHash", () => {
  const args = buildSaveComponentSpecRouteArgs({
    slug: "button",
    specRelPath: "docs/_spec/components/button.yml",
    specAbsPath: "/repo/docs/_spec/components/button.yml",
    specBackupsDirPath: "/repo/docs/_generated/spec-backups",
    repoRoot: "/repo",
    tokenRegistryPath: "/repo/docs/_generated/token-registry.json",
    maxBytes: 500_000,
    body: {
      raw: "name: button\n",
      expectedHash: "   ",
      confirmRiskyChanges: true,
      refreshRegistry: false,
    },
  });
  assert.equal(args.raw, "name: button\n");
  assert.equal(args.expectedHash, null);
  assert.equal(args.confirmRiskyChanges, true);
  assert.equal(args.refreshRegistryAfterSave, false);
});

test("component-spec-route-handler-service: restore args normalize refresh flag", () => {
  const args = buildRestoreComponentSpecRouteArgs({
    slug: "button",
    specRelPath: "docs/_spec/components/button.yml",
    specAbsPath: "/repo/docs/_spec/components/button.yml",
    repoRoot: "/repo",
    specBackupsDirPath: "/repo/docs/_generated/spec-backups",
    body: {},
    sha256TextFn: () => "hash",
  });
  assert.equal(args.refreshRegistryAfterRestore, true);
  assert.equal(typeof args.sha256TextFn, "function");
});

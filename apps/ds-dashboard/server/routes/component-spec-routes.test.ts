import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { registerComponentSpecRoutes } from "./component-spec-routes.mjs";

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

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-component-spec-routes-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function resolveRepoFilePath(repoRoot: string, relPath: string) {
  const absolute = path.resolve(repoRoot, String(relPath || ""));
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (absolute === repoRoot || absolute.startsWith(rootWithSep)) return absolute;
  return null;
}

function createTestApp(overrides: Partial<Record<string, unknown>> = {}) {
  const app = new Hono();
  registerComponentSpecRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({
      repoRoot: "/repo",
      componentRegistryPath: "/repo/docs/_generated/component-registry.json",
      specBackupsDirPath: "/repo/docs/_generated/spec-backups",
      tokenRegistryPath: "/repo/docs/_generated/token-registry.json",
    }),
    isDevRuntime: () => true,
    readJsonBody: async () => ({}),
    resolveRepoFilePath,
    sha256Text: () => "hash",
    ...overrides,
  });
  return app;
}

test("component-spec-routes: rejects invalid slug", async () => {
  const app = createTestApp();
  const res = await app.request("/api/component-spec/INVALID-SLUG");
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.code, "validation.invalid_component_slug");
});

test("component-spec-routes: write endpoints are blocked outside development", async () => {
  const app = createTestApp({
    isDevRuntime: () => false,
  });
  const res = await app.request("/api/component-spec/button/validate", { method: "POST" });
  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.code, "component_spec.editing_disabled");
});

test("component-spec-routes: get returns current spec document payload", async () => {
  await withTempDir(async (dir) => {
    const componentRegistryPath = path.join(dir, "docs/_generated/component-registry.json");
    const specRelPath = "docs/_spec/components/button.yml";
    const specAbsPath = path.join(dir, specRelPath);
    await fs.mkdir(path.dirname(componentRegistryPath), { recursive: true });
    await fs.mkdir(path.dirname(specAbsPath), { recursive: true });
    await fs.writeFile(
      componentRegistryPath,
      JSON.stringify({
        components: [
          {
            slug: "button",
            paths: { spec: specRelPath },
          },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(specAbsPath, "name: button\nstatus: draft\n", "utf8");

    const app = createTestApp({
      getSystemContext: () => ({
        repoRoot: dir,
        componentRegistryPath,
        specBackupsDirPath: path.join(dir, "docs/_generated/spec-backups"),
        tokenRegistryPath: path.join(dir, "docs/_generated/token-registry.json"),
      }),
    });

    const res = await app.request("/api/component-spec/button");
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.slug, "button");
    assert.equal(payload.path, specRelPath);
    assert.equal(payload.rawHash, "hash");
    assert.equal(payload.parsed.name, "button");
  });
});

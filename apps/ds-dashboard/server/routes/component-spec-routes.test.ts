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
      systemId: "sys-01",
      docsDir: "/repo/docs",
      specBackupsDirPath: "/repo/docs/_generated/spec-backups",
    }),
    isDevRuntime: () => true,
    readJsonBody: async () => ({}),
    resolveRepoFilePath,
    sha256Text: () => "hash",
    tokenRepo: {
      getTokenRegistry: () => ({ entries: [] }),
    },
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

test("component-spec-routes: patch editorial is blocked outside development", async () => {
  const app = createTestApp({
    isDevRuntime: () => false,
  });
  const res = await app.request("/api/component-spec/button/editorial", { method: "PATCH" });
  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.code, "component_spec.editing_disabled");
});

test("component-spec-routes: get returns current spec document payload", async () => {
  await withTempDir(async (dir) => {
    const specRelPath = "docs/_spec/components/button.yml";
    const specAbsPath = path.join(dir, specRelPath);
    await fs.mkdir(path.dirname(specAbsPath), { recursive: true });
    await fs.writeFile(specAbsPath, "name: button\nstatus: draft\n", "utf8");

    const app = createTestApp({
      getSystemContext: () => ({
        repoRoot: dir,
        systemId: "sys-01",
        docsDir: path.join(dir, "docs"),
        specBackupsDirPath: path.join(dir, "docs/_generated/spec-backups"),
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

test("component-spec-routes: patch editorial updates allowed fields", async () => {
  await withTempDir(async (dir) => {
    const specRelPath = "docs/_spec/components/button.yml";
    const docRelPath = "docs/components/button.md";
    const specAbsPath = path.join(dir, specRelPath);
    const docAbsPath = path.join(dir, docRelPath);
    await fs.mkdir(path.dirname(specAbsPath), { recursive: true });
    await fs.mkdir(path.dirname(docAbsPath), { recursive: true });
    await fs.writeFile(
      specAbsPath,
      [
        "name: Button",
        "status: draft",
        "summary:",
        "  purpose: old",
        "  when_to_use: old",
        "  when_not_to_use: old",
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      docAbsPath,
      [
        "# Button",
        "",
        "## Overview",
        "",
        "- Purpose: old purpose",
        "",
        "## Usage Guidelines",
        "",
        "### When to use",
        "",
        "- old use",
        "",
        "### When not to use",
        "",
        "- old dont",
        "",
      ].join("\n"),
      "utf8",
    );

    const app = createTestApp({
      readJsonBody: async () => ({
        expectedHash: null,
        fields: {
          summary: {
            purpose: "new",
            when_to_use: "new",
            when_not_to_use: "new",
          },
        },
      }),
      getSystemContext: () => ({
        repoRoot: dir,
        systemId: "sys-01",
        docsDir: path.join(dir, "docs"),
        specBackupsDirPath: path.join(dir, "docs/_generated/spec-backups"),
      }),
    });

    const res = await app.request("/api/component-spec/button/editorial", { method: "PATCH" });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.savedKeys, ["summary"]);
    assert.equal(payload.markdownSynced, true);
    const updated = await fs.readFile(specAbsPath, "utf8");
    assert.match(updated, /purpose: new/);
    const updatedDoc = await fs.readFile(docAbsPath, "utf8");
    assert.match(updatedDoc, /- Purpose: new/);
    assert.match(updatedDoc, /### When to use[\s\S]*new/);
    assert.match(updatedDoc, /### When not to use[\s\S]*new/);
  });
});

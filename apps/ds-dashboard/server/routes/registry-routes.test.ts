import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Hono } from "hono";

import { registerRegistryRoutes } from "./registry-routes.mjs";

function createFailJson() {
  return (c: any, statusCode: number, args: Record<string, unknown>) =>
    c.json(
      {
        ok: false,
        code: args.code,
        message: args.userMessage,
      },
      statusCode,
    );
}

function createTestApp(
  componentRepoOverrides: Record<string, unknown> = {},
  options: { repoRoot?: string; systemId?: string } = {},
) {
  const systemId = options.systemId ?? "sys-01";
  const repoRoot = options.repoRoot ?? "/repo";
  const app = new Hono();
  registerRegistryRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ systemId, repoRoot }),
    componentRepo: {
      getAll: () => [],
      getEditorialByComponentIds: () => new Map(),
      ...componentRepoOverrides,
    },
    tokenRepo: {
      getTokenRegistry: () => ({ entries: [] }),
    },
  });
  return app;
}

test("registry-routes: /api/component-usage-index returns empty graph for db-backed components without spec refs", async () => {
  const app = createTestApp({
    getAll: () => [
      { id: 1, slug: "button" },
      { id: 2, slug: "icon" },
    ],
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = (await res.json()) as any;
  assert.deepEqual(payload.by_slug.button.uses, []);
  assert.deepEqual(payload.by_slug.icon.used_in, []);
});

test("registry-routes: /api/component-usage-index resolves YAML relationships derived from markdownPath", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "registry-usage-route-"));
  try {
    const specPath = path.join(
      tmpRoot,
      "design-systems",
      "sys-01",
      "docs",
      "_spec",
      "components",
      "button.yml",
    );
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(
      specPath,
      [
        "name: button",
        "status: draft",
        "anatomy:",
        "  - id: icon_item",
        "    component_ref: icon",
        "",
      ].join("\n"),
      "utf8",
    );

    const app = createTestApp(
      {
        getAll: () => [
          {
            id: 1,
            slug: "button",
            specs: [{ markdownPath: "design-systems/sys-01/docs/components/button.md" }],
          },
          {
            id: 2,
            slug: "icon",
            specs: [{ markdownPath: "design-systems/sys-01/docs/components/icon.md" }],
          },
        ],
      },
      { repoRoot: tmpRoot, systemId: "sys-01" },
    );

    const res = await app.request("/api/component-usage-index");
    assert.equal(res.status, 200);
    const payload = (await res.json()) as any;
    assert.deepEqual(payload.by_slug.button.uses, ["icon"]);
    assert.deepEqual(payload.by_slug.icon.used_in, ["button"]);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

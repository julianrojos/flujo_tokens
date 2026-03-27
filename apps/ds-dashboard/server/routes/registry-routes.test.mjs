import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { registerRegistryRoutes } from "./registry-routes.mjs";

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

async function createFixtureFiles() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ds-registry-routes-"));
  const specPath = path.join(root, "docs/_spec/components/button.yml");
  await fs.mkdir(path.dirname(specPath), { recursive: true });
  await fs.writeFile(specPath, "related_components:\n  - input\n", "utf8");

  const componentRegistryPath = path.join(root, "docs/_generated/component-registry.json");
  await fs.mkdir(path.dirname(componentRegistryPath), { recursive: true });
  await fs.writeFile(
    componentRegistryPath,
    JSON.stringify(
      {
        components: [
          { slug: "button", paths: { spec: "docs/_spec/components/button.yml" } },
          { slug: "input", paths: { spec: "docs/_spec/components/input.yml" } },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const tokenRegistryPath = path.join(root, "docs/_generated/token-registry.json");
  await fs.writeFile(
    tokenRegistryPath,
    JSON.stringify(
      {
        entries: [
          { collection: "Core", path: "Color.Primary", slashPath: "Core/Color/Primary" },
          { collection: "Core", path: "Color.Secondary", slashPath: "Core/Color/Secondary" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    root,
    componentRegistryPath,
    tokenRegistryPath,
  };
}

function createApp(sysCtx) {
  const app = new Hono();
  registerRegistryRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => sysCtx,
  });
  return app;
}

test("registry-routes: /api/component-registry returns registry artifact", async () => {
  const fixture = await createFixtureFiles();
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: fixture.componentRegistryPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-registry");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(Array.isArray(payload.components), true);
  assert.equal(payload.components.length, 2);
});

test("registry-routes: /api/component-usage-index builds by_slug graph", async () => {
  const fixture = await createFixtureFiles();
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: fixture.componentRegistryPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-usage-index");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.deepEqual(payload.by_slug.button.uses, ["input"]);
  assert.deepEqual(payload.by_slug.input.used_in, ["button"]);
});

test("registry-routes: /api/token-collection-trees builds grouped view", async () => {
  const fixture = await createFixtureFiles();
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: fixture.componentRegistryPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/token-collection-trees");
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.summary.collections, 1);
  assert.equal(payload.summary.tokens, 2);
  assert.equal(payload.collections[0].collection, "Core");
});

test("registry-routes: /api/token-registry returns not found for missing artifact", async () => {
  const fixture = await createFixtureFiles();
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: fixture.componentRegistryPath,
    tokenRegistryPath: path.join(fixture.root, "docs/_generated/token-registry-missing.json"),
  });

  const res = await app.request("/api/token-registry");
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "file.not_found");
});

test("registry-routes: /api/component-registry returns not found when artifact missing (no fallback)", async () => {
  const fixture = await createFixtureFiles();
  const missingPath = path.join(fixture.root, "docs/_generated/component-registry-not-found.json");
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: missingPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-registry");
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "file.not_found");
});

test("registry-routes: /api/component-registry returns not found when file is missing but directory exists", async () => {
  const fixture = await createFixtureFiles();
  const generatedDir = path.join(fixture.root, "docs/_generated");
  await fs.mkdir(generatedDir, { recursive: true });
  const missingPath = path.join(generatedDir, "component-registry-missing.json");
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: missingPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-registry");
  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.code, "file.not_found");
});

test("registry-routes: /api/component-registry returns invalid_json when artifact is malformed", async () => {
  const fixture = await createFixtureFiles();
  const malformedPath = path.join(fixture.root, "docs/_generated/component-registry-malformed.json");
  await fs.writeFile(malformedPath, "{ invalid-json", "utf8");
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: malformedPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-registry");
  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.code, "internal.unexpected_error");
  assert.match(String(payload.message || ""), /not valid JSON/i);
});

test("registry-routes: /api/component-registry returns empty when artifact file is blank", async () => {
  const fixture = await createFixtureFiles();
  const emptyPath = path.join(fixture.root, "docs/_generated/component-registry-empty.json");
  await fs.writeFile(emptyPath, "   \n", "utf8");
  const app = createApp({
    repoRoot: fixture.root,
    componentRegistryPath: emptyPath,
    tokenRegistryPath: fixture.tokenRegistryPath,
  });

  const res = await app.request("/api/component-registry");
  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.code, "internal.unexpected_error");
  assert.match(String(payload.message || ""), /artifact is empty/i);
});

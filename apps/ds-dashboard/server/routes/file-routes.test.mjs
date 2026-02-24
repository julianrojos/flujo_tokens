import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { registerFileRoutes } from "./file-routes.mjs";

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

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-file-routes-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function resolveSafeFile(repoRoot, requested) {
  const absolute = path.resolve(repoRoot, String(requested || ""));
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (absolute === repoRoot || absolute.startsWith(rootWithSep)) return absolute;
  return null;
}

function createTestApp(repoRoot) {
  const app = new Hono();
  registerFileRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: () => ({ repoRoot }),
    resolveRepoFilePath: resolveSafeFile,
    readTextFileLimited: async (filePath) => {
      const content = await fs.readFile(filePath, "utf8");
      return { content, truncated: false };
    },
    findLineForQuery: (content, query) => {
      const lines = String(content || "").split(/\r?\n/);
      const target = String(query || "").trim();
      if (!target) return null;
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(target)) return i + 1;
      }
      return null;
    },
    buildSnippet: (content, line, before, after) => {
      const lines = String(content || "").split(/\r?\n/);
      const targetLine = Math.max(1, Math.min(lines.length, Number(line || 1)));
      const startLine = Math.max(1, targetLine - Math.max(0, Number(before || 0)));
      const endLine = Math.min(lines.length, targetLine + Math.max(0, Number(after || 0)));
      return {
        targetLine,
        startLine,
        endLine,
        snippet: lines.slice(startLine - 1, endLine).join("\n"),
      };
    },
    guessContentType: (filePath) => {
      if (String(filePath).endsWith(".txt")) return "text/plain; charset=utf-8";
      return "application/octet-stream";
    },
    MAX_FILE_BYTES: 1024 * 1024,
  });
  return app;
}

test("file-routes: /api/file rejects invalid path", async () => {
  await withTempDir(async (repoRoot) => {
    const app = createTestApp(repoRoot);
    const res = await app.request("/api/file?path=../../etc/passwd");
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.code, "file.invalid_path");
  });
});

test("file-routes: /api/file returns file content", async () => {
  await withTempDir(async (repoRoot) => {
    const relPath = "docs/readme.txt";
    const absPath = path.join(repoRoot, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, "alpha\nbeta\n", "utf8");

    const app = createTestApp(repoRoot);
    const res = await app.request(`/api/file?path=${encodeURIComponent(relPath)}`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.truncated, false);
    assert.equal(payload.content, "alpha\nbeta\n");
  });
});

test("file-routes: /api/file-snippet returns query match snippet", async () => {
  await withTempDir(async (repoRoot) => {
    const relPath = "docs/sample.txt";
    const absPath = path.join(repoRoot, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, "line-1\nneedle line\nline-3\n", "utf8");

    const app = createTestApp(repoRoot);
    const res = await app.request(
      `/api/file-snippet?file=${encodeURIComponent(relPath)}&q=${encodeURIComponent("needle")}&before=0&after=0`,
    );
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.matchedBy, "query");
    assert.equal(payload.line, 2);
    assert.equal(payload.snippet, "needle line");
  });
});

test("file-routes: /api/asset streams file bytes with content type", async () => {
  await withTempDir(async (repoRoot) => {
    const relPath = "assets/logo.txt";
    const absPath = path.join(repoRoot, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, "asset-content", "utf8");

    const app = createTestApp(repoRoot);
    const res = await app.request(`/api/asset?path=${encodeURIComponent(relPath)}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    const text = await res.text();
    assert.equal(text, "asset-content");
  });
});

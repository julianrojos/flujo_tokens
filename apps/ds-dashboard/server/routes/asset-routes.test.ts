import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { registerAssetRoutes } from './asset-routes.mjs';

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-asset-routes-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function resolveSafeFile(repoRoot: string, requested: string) {
  const absolute = path.resolve(repoRoot, String(requested || ''));
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;
  if (absolute === repoRoot || absolute.startsWith(rootWithSep)) return absolute;
  return null;
}

function createTestApp(repoRoot: string) {
  const app = new Hono();
  registerAssetRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: async () => ({ repoRoot }),
    resolveRepoFilePath: resolveSafeFile,
  });
  return app;
}

function createTestAppWithSystemRoots(systemRoots: Record<string, string>, defaultRoot: string) {
  const app = new Hono();
  registerAssetRoutes(app, {
    failJson: createFailJson(),
    getSystemContext: async (systemHeader: string) => ({
      repoRoot: systemRoots[systemHeader] ?? defaultRoot,
    }),
    resolveRepoFilePath: resolveSafeFile,
  });
  return app;
}

describe('/api/asset', () => {
  it('streams file bytes with content type', async () => {
    await withTempDir(async (repoRoot) => {
      const relPath = 'design-systems/sys-01/docs/_generated/visual-proofs/images/button.png';
      const absPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const app = createTestApp(repoRoot);
      const res = await app.request(`/api/asset?path=${encodeURIComponent(relPath)}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      const body = new Uint8Array(await res.arrayBuffer());
      assert.equal(body.byteLength, 4);
    });
  });

  it('rejects invalid paths', async () => {
    await withTempDir(async (repoRoot) => {
      const app = createTestApp(repoRoot);
      const res = await app.request('/api/asset?path=../../etc/passwd');
      assert.equal(res.status, 400);
      const payload = await res.json();
      assert.equal((payload as any).code, 'asset.invalid_path');
    });
  });

  it('rejects non-visual-proof files inside the repo', async () => {
    await withTempDir(async (repoRoot) => {
      const relPath = 'package.json';
      const absPath = path.join(repoRoot, relPath);
      await fs.writeFile(absPath, '{"name":"demo"}');

      const app = createTestApp(repoRoot);
      const res = await app.request(`/api/asset?path=${encodeURIComponent(relPath)}`);
      assert.equal(res.status, 403);
      const payload = await res.json();
      assert.equal((payload as any).code, 'asset.forbidden');
    });
  });

  it('rejects files outside the visual proofs directory', async () => {
    await withTempDir(async (repoRoot) => {
      const relPath = 'design-systems/sys-01/docs/overview.md';
      const absPath = path.join(repoRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, '# overview');

      const app = createTestApp(repoRoot);
      const res = await app.request(`/api/asset?path=${encodeURIComponent(relPath)}`);
      assert.equal(res.status, 403);
      const payload = await res.json();
      assert.equal((payload as any).code, 'asset.forbidden');
    });
  });

  it('uses the system query parameter to resolve the asset root', async () => {
    await withTempDir(async (tmpDir) => {
      const defaultRoot = path.join(tmpDir, 'root-a');
      const otherRoot = path.join(tmpDir, 'root-b');
      const relPath = 'design-systems/sys-02/docs/_generated/visual-proofs/images/button.png';
      const absPath = path.join(otherRoot, relPath);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const app = createTestAppWithSystemRoots({ 'sys-02': otherRoot }, defaultRoot);
      const res = await app.request(`/api/asset?system=sys-02&path=${encodeURIComponent(relPath)}`);
      assert.equal(res.status, 200);
      const body = new Uint8Array(await res.arrayBuffer());
      assert.equal(body.byteLength, 4);
    });
  });
});

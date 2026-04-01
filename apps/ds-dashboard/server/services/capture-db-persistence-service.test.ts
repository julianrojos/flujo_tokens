import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  persistCapturePayloadToComponentRepo,
  persistRegistryEntriesToComponentRepo,
} from './capture-db-persistence-service.ts';

describe('capture-db-persistence-service', () => {
  it('persists captured visual proof rows into component repository', () => {
    const upsertCalls: unknown[] = [];
    const componentRepo = {
      getAll: () => [
        {
          slug: 'button',
          name: 'Button',
          figmaFileUrl: 'https://www.figma.com/design/OLD_FILE',
          figmaComponentSetNodeId: '1:99',
          specs: [
            {
              markdownPath: 'design-systems/sys-01/docs/components/button.md',
              docStatus: 'ready',
              coverage: 100,
            },
          ],
        },
      ],
      getBySlug: () => ({
        name: 'Button',
        figmaFileUrl: 'https://www.figma.com/design/OLD_FILE',
        figmaComponentSetNodeId: '1:99',
        specs: [{ markdownPath: 'design-systems/sys-01/docs/components/button.md', docStatus: 'ready', coverage: 100 }],
      }),
      upsertFromRegistry: (_dsId: string, entries: unknown[]) => {
        upsertCalls.push(entries);
        return entries.length;
      },
    } as any;

    const result = persistCapturePayloadToComponentRepo({
      payload: {
        source: {
          file_key: 'ABC123',
        },
        targets: [
          {
            slug: 'button',
            node_id: '1:2',
            markdown_path: 'design-systems/sys-01/docs/components/button.md',
          },
        ],
        captured: [
          {
            slug: 'button',
            node_id: '1:2',
            markdown_path: 'design-systems/sys-01/docs/components/button.md',
            local_image_path: '/repo/design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
            screenshot_url: 'https://cdn.example.com/button.png',
            variants_count: 3,
            captured_at: '2026-03-31T09:59:59.000Z',
            image_sha256: 'abc123',
            image_bytes: 2048,
            image_content_type: 'image/png',
            image_width: 400,
            image_height: 240,
            variants: [
              {
                name: 'Primary',
                node_id: '1:3',
                screenshot_url: 'https://cdn.example.com/button-primary.png',
                image_path: 'design-systems/sys-01/docs/_generated/visual-proofs/images/variants/button__01__primary.png',
                captured_at: '2026-03-31T09:59:59.000Z',
              },
            ],
          },
        ],
      },
      componentRepo,
      systemId: 'sys-01',
      repoRoot: '/repo',
      nowIso: () => '2026-03-31T10:00:00.000Z',
    });

    assert.deepEqual(result, { attempted: 1, upserted: 1, skipped: 0 });
    assert.equal(upsertCalls.length, 1);
    const entries = upsertCalls[0] as Array<Record<string, any>>;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].slug, 'button');
    assert.equal(entries[0].name, 'Button');
    assert.equal(entries[0].figma.fileUrl, 'https://www.figma.com/design/ABC123');
    assert.equal(entries[0].figma.componentSetNodeId, '1:2');
    assert.equal(entries[0].specs[0].markdownPath, 'design-systems/sys-01/docs/components/button.md');
    assert.equal(
      entries[0].visualProofs[0].imagePath,
      'design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
    );
    assert.equal(entries[0].visualProofs[0].capturedAt, '2026-03-31T09:59:59.000Z');
    assert.equal(entries[0].visualProofs[0].variantsCount, 3);
    assert.equal(entries[0].visualProofs[0].imageSha256, 'abc123');
    assert.equal(entries[0].visualProofs[0].imageBytes, 2048);
    assert.equal(entries[0].visualProofs[0].imageContentType, 'image/png');
    assert.equal(entries[0].visualProofs[0].imageWidth, 400);
    assert.equal(entries[0].visualProofs[0].imageHeight, 240);
    assert.ok(Array.isArray(entries[0].visualProofs[0].variants));
    assert.equal(entries[0].visualProofs[0].variants.length, 1);
  });

  it('skips rows without local image path', () => {
    let upsertCount = 0;
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => {
        upsertCount += 1;
        return 0;
      },
    } as any;

    const result = persistCapturePayloadToComponentRepo({
      payload: {
        captured: [
          {
            slug: 'alert',
            local_image_path: '',
          },
        ],
      },
      componentRepo,
      systemId: 'sys-01',
      repoRoot: '/repo',
    });

    assert.deepEqual(result, { attempted: 1, upserted: 0, skipped: 1 });
    assert.equal(upsertCount, 0);
  });

  it('keeps variants with empty names by assigning a safe fallback label', () => {
    const upsertCalls: unknown[] = [];
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: (_dsId: string, entries: unknown[]) => {
        upsertCalls.push(entries);
        return entries.length;
      },
    } as any;

    const result = persistCapturePayloadToComponentRepo({
      payload: {
        captured: [
          {
            slug: 'alert',
            local_image_path: '/repo/design-systems/sys-01/docs/_generated/visual-proofs/images/alert.png',
            variants: [
              {
                name: '',
                node_id: '10:1',
              },
            ],
          },
        ],
      },
      componentRepo,
      systemId: 'sys-01',
      repoRoot: '/repo',
      nowIso: () => '2026-03-31T10:00:00.000Z',
    });

    assert.deepEqual(result, { attempted: 1, upserted: 1, skipped: 0 });
    const entries = upsertCalls[0] as Array<Record<string, any>>;
    assert.equal(entries.length, 1);
    assert.ok(Array.isArray(entries[0].visualProofs[0].variants));
    assert.equal(entries[0].visualProofs[0].variants.length, 1);
    assert.equal(entries[0].visualProofs[0].variants[0].name, 'Variant');
  });

  it('defaults variantsCount to 0 when missing and variants are empty', () => {
    const upsertCalls: unknown[] = [];
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: (_dsId: string, entries: unknown[]) => {
        upsertCalls.push(entries);
        return entries.length;
      },
    } as any;

    const result = persistCapturePayloadToComponentRepo({
      payload: {
        captured: [
          {
            slug: 'chip',
            local_image_path: '/repo/design-systems/sys-01/docs/_generated/visual-proofs/images/chip.png',
          },
        ],
      },
      componentRepo,
      systemId: 'sys-01',
      repoRoot: '/repo',
      nowIso: () => '2026-03-31T10:00:00.000Z',
    });

    assert.deepEqual(result, { attempted: 1, upserted: 1, skipped: 0 });
    const entries = upsertCalls[0] as Array<Record<string, any>>;
    assert.equal(entries[0].visualProofs[0].variantsCount, 0);
  });

  it('throws on invalid payload shape when captured is not an array', () => {
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => 0,
    } as any;

    assert.throws(
      () =>
        persistCapturePayloadToComponentRepo({
          payload: {
            captured: {},
          },
          componentRepo,
          systemId: 'sys-01',
          repoRoot: '/repo',
        }),
      /captured.*must be an array/i,
    );
  });

  it('throws on invalid payload shape when captured rows are not objects', () => {
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => 0,
    } as any;

    assert.throws(
      () =>
        persistCapturePayloadToComponentRepo({
          payload: {
            captured: ['bad-row'],
          },
          componentRepo,
          systemId: 'sys-01',
          repoRoot: '/repo',
        }),
      /captured\[0\] must be an object/i,
    );
  });

  it('throws on invalid payload shape when captured row fields have wrong types', () => {
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => 0,
    } as any;

    assert.throws(
      () =>
        persistCapturePayloadToComponentRepo({
          payload: {
            captured: [
              {
                slug: 'button',
                local_image_path: '/repo/design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
                variants_count: 'NaN',
              },
            ],
          },
          componentRepo,
          systemId: 'sys-01',
          repoRoot: '/repo',
        }),
      /variants_count must be a finite number/i,
    );
  });

  it('skips rows when local_image_path points outside repo root', () => {
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => 0,
    } as any;

    const result = persistCapturePayloadToComponentRepo({
      payload: {
        captured: [
          {
            slug: 'button',
            local_image_path: '/tmp/escape/button.png',
          },
        ],
      },
      componentRepo,
      systemId: 'sys-01',
      repoRoot: '/repo',
    });

    assert.deepEqual(result, { attempted: 1, upserted: 0, skipped: 1 });
  });

  it('throws when image dimensions are out of range', () => {
    const componentRepo = {
      getAll: () => [],
      getBySlug: () => null,
      upsertFromRegistry: () => 0,
    } as any;

    assert.throws(
      () =>
        persistCapturePayloadToComponentRepo({
          payload: {
            captured: [
              {
                slug: 'button',
                local_image_path: '/repo/design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
                image_width: -1,
              },
            ],
          },
          componentRepo,
          systemId: 'sys-01',
          repoRoot: '/repo',
        }),
      /image_width/i,
    );
  });

  it('skips rows when local_image_path is a symlink escaping repo root', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-db-persistence-'));
    try {
      const repoRoot = path.join(tmpRoot, 'repo');
      const outsideRoot = path.join(tmpRoot, 'outside');
      fs.mkdirSync(repoRoot, { recursive: true });
      fs.mkdirSync(outsideRoot, { recursive: true });
      const outsideFile = path.join(outsideRoot, 'secret.png');
      fs.writeFileSync(outsideFile, 'not-an-image', 'utf8');
      const symlinkPath = path.join(repoRoot, 'proof-link.png');
      fs.symlinkSync(outsideFile, symlinkPath);

      const componentRepo = {
        getAll: () => [],
        getBySlug: () => null,
        upsertFromRegistry: () => 0,
      } as any;

      const result = persistCapturePayloadToComponentRepo({
        payload: {
          captured: [
            {
              slug: 'button',
              local_image_path: symlinkPath,
            },
          ],
        },
        componentRepo,
        systemId: 'sys-01',
        repoRoot,
      });
      assert.deepEqual(result, { attempted: 1, upserted: 0, skipped: 1 });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('reconciles empty registry payload by marking existing components as missing', () => {
    const upsertCalls: Array<{ dsId: string; entries: unknown[] }> = [];
    const missingCalls: Array<{ dsId: string; slugs: string[] }> = [];
    const componentRepo = {
      upsertFromRegistry: (dsId: string, entries: unknown[]) => {
        upsertCalls.push({ dsId, entries });
        return 0;
      },
      markMissingComponents: (dsId: string, slugs: string[]) => {
        missingCalls.push({ dsId, slugs });
        return 1;
      },
    } as any;

    const result = persistRegistryEntriesToComponentRepo({
      entries: [],
      componentRepo,
      systemId: 'sys-01',
    });

    assert.deepEqual(result, { attempted: 0, upserted: 0 });
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0]?.dsId, 'sys-01');
    assert.deepEqual(upsertCalls[0]?.entries, []);
    assert.equal(missingCalls.length, 1);
    assert.equal(missingCalls[0]?.dsId, 'sys-01');
    assert.deepEqual(missingCalls[0]?.slugs, []);
  });

  it('throws when registry entries payload is not an array', () => {
    let called = false;
    const componentRepo = {
      upsertFromRegistry: () => {
        called = true;
        return 0;
      },
      markMissingComponents: () => 0,
    } as any;

    assert.throws(
      () =>
        persistRegistryEntriesToComponentRepo({
          entries: null as unknown as Array<Record<string, unknown>>,
          componentRepo,
          systemId: 'sys-01',
        }),
      /invalid registry entries payload/i,
    );
    assert.equal(called, false);
  });
});

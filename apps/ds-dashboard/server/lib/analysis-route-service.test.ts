/**
 * Analysis Route Service Tests
 *
 * Tests for analysis route utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildImpactFailure,
  loadImpactArtifacts,
  parseImpactRequest,
  parseRefreshQuery,
} from './analysis-route-service.js';

describe('analysis-route-service', () => {
  describe('parseRefreshQuery()', () => {
    it('returns strict true value', () => {
      assert.equal(parseRefreshQuery('true'), true);
      assert.equal(parseRefreshQuery(' true '), true);
      assert.equal(parseRefreshQuery('false'), false);
      assert.equal(parseRefreshQuery(undefined), false);
    });
  });

  describe('parseImpactRequest()', () => {
    it('requires tokenPath', () => {
      const invalid = parseImpactRequest({
        tokenPathRaw: ' ',
        newValueRaw: null,
        depthRaw: null,
      });
      assert.equal(invalid.ok, false);
      assert.equal((invalid as any).errorArgs.code, 'validation.token_path_required');

      const ok = parseImpactRequest({
        tokenPathRaw: 'color.primary',
        newValueRaw: ' #fff ',
        depthRaw: '3',
      });
      assert.equal(ok.ok, true);
      assert.equal((ok as any).payload.tokenPath, 'color.primary');
      assert.equal((ok as any).payload.newValue, '#fff');
      assert.equal((ok as any).payload.depth, 3);
    });
  });

  describe('loadImpactArtifacts()', () => {
    it('parses all required payloads', async () => {
      const files: Record<string, string> = {
        '/token-registry.json': '{"ok":true}',
        '/token-graph-viz.json': '{"nodes":[],"edges":[]}',
        '/token-usage-index.json': '{"ok":true,"tokens":[]}',
        '/token-health.json': '{"ok":true}',
        '/component-registry.json': '{"components":[]}',
        '/wcag-pairs.json': '{"pairs":[{"a":"x","b":"y"}]}',
      };
      const loaded = await loadImpactArtifacts(
        {
          tokenRegistryPath: '/token-registry.json',
          tokenGraphVizPath: '/token-graph-viz.json',
          tokenUsageIndexPath: '/token-usage-index.json',
          tokenHealthPath: '/token-health.json',
          componentRegistryPath: '/component-registry.json',
          wcagPairsPath: '/wcag-pairs.json',
        },
        {
          readFileFn: async (filePath: string) => {
            if (!(filePath in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            return files[filePath];
          },
          normalizeImpactWcagPairsFn: (value: Record<string, unknown>) => value,
        }
      );
      assert.deepEqual(loaded.tokenRegistry, { ok: true });
      assert.deepEqual(loaded.tokenGraph, { nodes: [], edges: [] });
      assert.deepEqual(loaded.wcagPairs, { pairs: [{ a: 'x', b: 'y' }] });
    });

    it('falls back to generated graph and empty usage index when artifacts are missing', async () => {
      const files: Record<string, string> = {
        '/token-registry.json': JSON.stringify({
          entries: [
            {
              path: 'primitivos.color.blanco',
              slashPath: 'primitivos/color/blanco',
              cssVar: '--primitivos-color-blanco',
              type: 'color',
              collection: 'primitivos',
              resolvedValue: '#ffffff',
              displayKey: 'blanco',
            },
          ],
        }),
        '/token-health.json': '{"ok":true}',
        '/component-registry.json': '{"components":[]}',
        '/wcag-pairs.json': '{"pairs":[]}',
      };

      const loaded = await loadImpactArtifacts(
        {
          tokenRegistryPath: '/token-registry.json',
          tokenGraphVizPath: '/token-graph-viz.json',
          tokenUsageIndexPath: '/token-usage-index.json',
          tokenHealthPath: '/token-health.json',
          componentRegistryPath: '/component-registry.json',
          wcagPairsPath: '/wcag-pairs.json',
        },
        {
          readFileFn: async (filePath: string) => {
            if (!(filePath in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            return files[filePath];
          },
          normalizeImpactWcagPairsFn: (value: Record<string, unknown>) => value,
        }
      );

      const graph = loaded.tokenGraph as { nodes?: Array<{ path?: string }>; edges?: unknown[] };
      assert.equal(Array.isArray(graph.nodes), true);
      assert.equal(graph.nodes?.[0]?.path, 'primitivos.color.blanco');
      assert.deepEqual(graph.edges, []);

      const usage = loaded.tokenUsageIndex as { entries?: unknown[]; byPath?: Record<string, unknown> };
      assert.deepEqual(usage.entries, []);
      assert.deepEqual(usage.byPath, {});
    });
  });

  describe('buildImpactFailure()', () => {
    it('maps not found vs invalid request', () => {
      const notFound = buildImpactFailure('color.primary', new Error('token not found'));
      assert.equal(notFound.statusCode, 404);
      assert.equal(notFound.errorArgs.code, 'impact.token_not_found');

      const invalid = buildImpactFailure('color.primary', new Error('invalid payload'));
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.errorArgs.code, 'impact.invalid_request');
    });
  });
});

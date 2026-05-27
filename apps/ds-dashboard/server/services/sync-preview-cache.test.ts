import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSyncDiffDryRunInflightKey,
  buildSyncVariablesDryRunInflightKey,
  clearSyncDiffPreviewCacheForSystem,
  clearSyncVariablesPreviewCacheForSystem,
  getCachedSyncDiffPreviewResult,
  getCachedSyncVariablesPreviewResult,
  setCachedSyncDiffPreviewResult,
  setCachedSyncVariablesPreviewResult,
} from './sync-preview-cache.ts';

describe('sync-preview-cache', () => {
  it('normalizes inflight keys consistently across diff and variables previews', () => {
    const diffKey = buildSyncDiffDryRunInflightKey({
      systemId: ' sys-1 ',
      fileKey: ' file-1 ',
      fileVersion: ' v1 ',
    });
    const variablesKey = buildSyncVariablesDryRunInflightKey({
      systemId: 'sys-1',
      fileKey: 'file-1',
      fileVersion: 'v1',
    });

    assert.equal(diffKey, variablesKey);
  });

  it('stores and clears diff and variables preview entries independently by system', () => {
    const diffKey = buildSyncDiffDryRunInflightKey({
      systemId: 'sys-1',
      fileKey: 'file-1',
      fileVersion: 'v1',
    });
    const variablesKey = buildSyncVariablesDryRunInflightKey({
      systemId: 'sys-1',
      fileKey: 'file-1',
      fileVersion: 'v1',
    });

    setCachedSyncDiffPreviewResult(diffKey, 'sys-1', {
      ok: true,
      sourceCandidates: [],
      diff: {} as never,
      pathUsed: 'cache',
      fileVersion: 'v1',
      componentsDurationMs: 0,
    });
    setCachedSyncVariablesPreviewResult(variablesKey, 'sys-1', {
      status: 'completed',
      summary: 'ok',
      warnings: [],
      counts: {
        tokens: 0,
        tokenModeValues: 0,
        aliases: 0,
        components: 0,
        usageRestored: 0,
        usageDropped: 0,
      },
      raw: {},
    });

    assert.equal(getCachedSyncDiffPreviewResult(diffKey)?.ok, true);
    assert.equal(getCachedSyncVariablesPreviewResult(variablesKey)?.status, 'completed');

    clearSyncDiffPreviewCacheForSystem('sys-1');
    assert.equal(getCachedSyncDiffPreviewResult(diffKey), null);
    assert.equal(getCachedSyncVariablesPreviewResult(variablesKey)?.status, 'completed');

    clearSyncVariablesPreviewCacheForSystem('sys-1');
    assert.equal(getCachedSyncVariablesPreviewResult(variablesKey), null);
  });
});

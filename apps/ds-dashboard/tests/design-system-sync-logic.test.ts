import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveOverallSyncStatus,
  summarizeComponentsSyncResult,
  summarizeVariablesSyncResult,
} from '../src/features/system/design-system-sync-logic';

describe('design-system sync logic', () => {
  it('marks component sync as completed with warnings when some items fail', () => {
    const summary = summarizeComponentsSyncResult({
      ok: true,
      targets_total: 3,
      targets: [
        { slug: 'button', node_id: '1:1', doc_path: 'docs/button.md' },
      ],
      captured: [
        { slug: 'button', node_id: '1:1', doc_path: 'docs/button.md' },
      ],
      failed: [
        {
          slug: 'card',
          node_id: '1:2',
          doc_path: 'docs/card.md',
          error: 'Missing component set',
        },
      ],
      skipped: [],
    });

    assert.equal(summary.status, 'completed_with_warnings');
    assert.equal(summary.headline, 'Components synced with warnings');
    assert.equal(summary.details.includes('Captured: 1'), true);
    assert.equal(summary.warnings[0], '1 component(s) failed to import.');
  });

  it('marks variables sync as completed when the import is clean', () => {
    const summary = summarizeVariablesSyncResult({
      ok: true,
      tokens: 12,
      tokenModeValues: 7,
      aliases: 3,
      components: 4,
      componentsTruncated: false,
      usageRestored: 2,
      usageDropped: 1,
      dryRun: false,
      importMode: 'full',
      selectedCount: 0,
      notSelectedCount: 0,
    });

    assert.equal(summary.status, 'completed');
    assert.equal(summary.headline, 'Variables synced');
    assert.equal(summary.details.includes('Tokens: 12'), true);
    assert.equal(summary.warnings.length, 0);
  });

  it('resolves overall status from step results', () => {
    assert.equal(
      resolveOverallSyncStatus({
        components: 'completed',
        variables: 'completed',
        tokens: 'completed',
      }),
      'completed',
    );
    assert.equal(
      resolveOverallSyncStatus({
        components: 'completed',
        variables: 'failed',
        tokens: 'completed',
      }),
      'completed_with_warnings',
    );
    assert.equal(
      resolveOverallSyncStatus({
        components: 'running',
        variables: 'idle',
        tokens: 'idle',
      }),
      'running',
    );
  });
});

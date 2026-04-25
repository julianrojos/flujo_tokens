import assert from 'node:assert';
import { describe, it } from 'node:test';

import { formatSyncedAt } from '../src/lib/format-synced-at';

describe('formatSyncedAt', () => {
  it('falls back for empty or whitespace-only values', () => {
    assert.equal(formatSyncedAt(undefined), '—');
    assert.equal(formatSyncedAt(''), '—');
    assert.equal(formatSyncedAt('   '), '—');
  });

  it('falls back for invalid timestamps', () => {
    assert.equal(formatSyncedAt('not-a-date'), '—');
  });
});

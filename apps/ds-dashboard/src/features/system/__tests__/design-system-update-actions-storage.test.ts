import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  clearPersistedSyncState,
  loadPersistedSyncState,
} from '../design-system-update-actions.js';

type StorageMap = Map<string, string>;

function installFakeWindow(storage: StorageMap) {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const fakeWindow = {
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(String(key), String(value));
      },
      removeItem(key: string) {
        storage.delete(String(key));
      },
    },
  };
  (globalThis as { window?: unknown }).window = fakeWindow;
  return () => {
    (globalThis as { window?: unknown }).window = originalWindow;
  };
}

describe('design-system-update-actions storage helpers', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('clears persisted sync state for a system id', () => {
    const storage = new Map<string, string>();
    const restore = installFakeWindow(storage);
    try {
      const key = 'ds-design-system-sync-state:core';
      storage.set(
        key,
        JSON.stringify({
          systemId: 'core',
          updatedAt: '2026-05-12T00:00:00.000Z',
          steps: {
            components: { status: 'completed', summary: null, jobId: 'job_1' },
            variables: { status: 'completed', summary: null, jobId: 'job_1' },
            tokens: { status: 'running', summary: null, jobId: 'job_1' },
          },
        }),
      );

      assert.equal(loadPersistedSyncState('core')?.steps.tokens.status, 'running');
      clearPersistedSyncState('core');
      assert.equal(storage.has(key), false);
      assert.equal(loadPersistedSyncState('core'), null);
    } finally {
      restore();
    }
  });
});

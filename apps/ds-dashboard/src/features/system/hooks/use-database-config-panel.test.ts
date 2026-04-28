import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LOCAL_DATABASE_URL,
  getDatabaseUrlForProviderChange,
  shouldRestartAfterSave,
} from './use-database-config-panel.js';

describe('useDatabaseConfigPanel helpers', () => {
  it('resets a clean local draft when switching to Supabase', () => {
    assert.equal(
      getDatabaseUrlForProviderChange({
        currentDatabaseUrl: DEFAULT_LOCAL_DATABASE_URL,
        nextProvider: 'supabase',
        isDraftDirty: false,
      }),
      '',
    );
  });

  it('preserves a dirty custom draft when switching providers', () => {
    assert.equal(
      getDatabaseUrlForProviderChange({
        currentDatabaseUrl:
          'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
        nextProvider: 'local',
        isDraftDirty: true,
      }),
      'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
    );
  });

  it('restarts after save when the saved config requires it even if provider stays the same', () => {
    assert.equal(
      shouldRestartAfterSave({
        saveResponse: {
          restartRequired: true,
          provider: 'local',
        },
        requestedProvider: 'local',
      }),
      true,
    );
  });
});

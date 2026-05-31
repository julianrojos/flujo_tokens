import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summarizeComponentsSyncResult } from '../design-system-sync-logic.js';

describe('summarizeComponentsSyncResult', () => {
  it('does not add the no-targets warning when the scan already failed', () => {
    type FailedCaptureResult = Parameters<typeof summarizeComponentsSyncResult>[0] & {
      ok: false;
      error: string;
      message?: string;
      captured: [];
      failed: [];
      skipped: [];
      targets: [];
    };

    const failedResult = {
      ok: false,
      error: 'scan_failed',
      message: 'Scan failed.',
      captured: [],
      failed: [],
      skipped: [],
      targets: [],
    } satisfies FailedCaptureResult;

    const summary = summarizeComponentsSyncResult(failedResult);

    assert.equal(summary.status, 'failed');
    assert.deepEqual(summary.warnings, ['scan_failed']);
  });
});

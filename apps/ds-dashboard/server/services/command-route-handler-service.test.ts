import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summarizeCapturedStep } from './command-route-handler-service.ts';

describe('summarizeCapturedStep', () => {
  it('treats a failed empty capture run as failed', () => {
    const summary = summarizeCapturedStep({
      ok: false,
      captured: [],
      failed: [],
      skipped: [],
      targets: [],
      error: 'Figma API 503',
    });

    assert.equal(summary.status, 'failed');
    assert.ok(summary.warnings.includes('Figma API 503'));
    assert.ok(
      !summary.warnings.includes('No capture targets were resolved from the Figma file.'),
    );
  });

  it('keeps an empty successful capture run as a warning', () => {
    const summary = summarizeCapturedStep({
      ok: true,
      captured: [],
      failed: [],
      skipped: [],
      targets: [],
    });

    assert.equal(summary.status, 'completed_with_warnings');
    assert.ok(
      summary.warnings.includes('No capture targets were resolved from the Figma file.'),
    );
  });
});

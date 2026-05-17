import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeDesignSystemImportCoverage,
  summarizeCapturedStep,
} from './command-route-handler-service.ts';

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

describe('computeDesignSystemImportCoverage', () => {
  it('uses Figma source candidates to keep pending counts in sync with the latest snapshot', () => {
    const coverage = computeDesignSystemImportCoverage(
      [
        { name: 'Button', status: 'ready', nodeId: '111:222' },
        { name: 'Input', status: 'ready', nodeId: '333:444' },
        { name: 'Select', status: 'ready', nodeId: '555:666' },
      ],
      [
        { node_id: '111:222', name: 'Button' },
        { node_id: '333:444', name: 'Input' },
        { node_id: '555:666', name: 'Select' },
        { node_id: '777:888', name: 'Textarea' },
      ],
    );

    assert.equal(coverage.detectedComponentsCount, 4);
    assert.equal(coverage.importedComponentsCount, 3);
    assert.equal(coverage.pendingComponentsCount, 1);
    assert.deepEqual(coverage.importedComponentNames, ['Button', 'Input', 'Select']);
    assert.deepEqual(coverage.pendingComponentNames, ['Textarea']);
  });

  it('falls back to DB-only counts when no sourceCandidates are given', () => {
    const coverage = computeDesignSystemImportCoverage([
      { name: 'Button', status: 'ready', nodeId: '111:222' },
      { name: 'Ghost', status: 'missing', nodeId: null },
    ]);

    assert.equal(coverage.detectedComponentsCount, 2);
    assert.equal(coverage.importedComponentsCount, 1);
    assert.equal(coverage.pendingComponentsCount, 1);
    assert.deepEqual(coverage.importedComponentNames, ['Button']);
    assert.deepEqual(coverage.pendingComponentNames, ['Ghost']);
  });

  it('treats an explicit empty sourceCandidates array as an empty Figma snapshot', () => {
    const coverage = computeDesignSystemImportCoverage(
      [
        { name: 'Button', status: 'ready', nodeId: '111:222' },
        { name: 'Ghost', status: 'missing', nodeId: null },
      ],
      [],
    );

    assert.equal(coverage.detectedComponentsCount, 0);
    assert.equal(coverage.importedComponentsCount, 0);
    assert.equal(coverage.pendingComponentsCount, 0);
    assert.deepEqual(coverage.importedComponentNames, []);
    assert.deepEqual(coverage.pendingComponentNames, []);
  });

  it('does not mark a candidate as imported when nodeId differs, even if name matches', () => {
    const coverage = computeDesignSystemImportCoverage(
      [{ name: 'Button', status: 'ready', nodeId: '111:222' }],
      [{ node_id: '999:000', name: 'Button' }],
    );

    assert.equal(coverage.pendingComponentsCount, 1);
    assert.deepEqual(coverage.pendingComponentNames, ['Button']);
  });
});

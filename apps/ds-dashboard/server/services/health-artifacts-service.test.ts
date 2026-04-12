/**
 * Health Artifacts Service Tests
 *
 * Tests for health report utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEmptyComponentsHealthReport,
  buildEmptyTokenHealthReport,
  filterSnapshotsByRange,
  normalizeHealthHistoryPayload,
  normalizeHealthHistoryRange,
} from './health-artifacts-service.js';

describe('health-artifacts-service', () => {
  describe('buildEmptyTokenHealthReport()', () => {
    it('keeps bootstrap shape', () => {
      const report = buildEmptyTokenHealthReport({
        tokenRegistryPath: '/repo/docs/_generated/token-registry.json',
        tokenUsageIndexPath: '/repo/docs/_generated/token-usage-index.json',
        tokenGraphVizPath: '/repo/docs/_generated/token-graph-viz.json',
        wcagPairsPath: '/repo/docs/_generated/wcag-pairs.json',
        reason: 'not found',
      });

      assert.equal(report.ok, false);
      assert.equal(report.bootstrapped, true);
      assert.equal(report.summary.tokens_total, 0);
      assert.equal(report.warnings.length, 1);
    });
  });

  describe('buildEmptyComponentsHealthReport()', () => {
    it('keeps bootstrap shape', () => {
      const report = buildEmptyComponentsHealthReport({
        componentRegistryPath: '/repo/docs/_generated/component-registry.json',
      });

      assert.equal(report.ok, false);
      assert.equal(report.bootstrapped, true);
      assert.equal(report.summary.total_components, 0);
      assert.deepEqual(report.filters.without_spec.items, []);
    });
  });

  describe('normalizeHealthHistoryRange()', () => {
    it('defaults unknown values', () => {
      assert.equal(normalizeHealthHistoryRange('7d'), '7d');
      assert.equal(normalizeHealthHistoryRange('90d'), '90d');
      assert.equal(normalizeHealthHistoryRange('bad'), '30d');
    });
  });

  describe('normalizeHealthHistoryPayload()', () => {
    it('sanitizes snapshots', () => {
      const payload = normalizeHealthHistoryPayload({
        schema_version: 2,
        snapshots: [
          {
            captured_at: '2026-02-20T00:00:00.000Z',
            metrics: { wcag_failures_total: '2' },
            fingerprints: { token_health: 'abc' },
            meta: { before_ref: 'HEAD~2' },
          },
          {
            captured_at: '',
          },
        ],
      });

      assert.equal(payload.ok, true);
      assert.equal(payload.schema_version, 2);
      assert.equal(payload.snapshots.length, 1);
      assert.equal(payload.snapshots[0].metrics.wcag_failures_total, 2);
      assert.equal(payload.snapshots[0].meta.before_ref, 'HEAD~2');
    });
  });

  describe('filterSnapshotsByRange()', () => {
    it('keeps only recent snapshots', () => {
      const now = Date.now();
      const old = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
      const recent = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

      const filtered = filterSnapshotsByRange(
        [{ captured_at: old }, { captured_at: recent }],
        '30d'
      );

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].captured_at, recent);
    });
  });
});

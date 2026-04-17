/**
 * Spec Result Tests
 *
 * Tests for buildSpecGenerationResult function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSpecGenerationResult } from './spec-result.js';

describe('spec-result', () => {
  describe('buildSpecGenerationResult()', () => {
    it('builds stable JSON payload for CLI stdout', () => {
      const result = buildSpecGenerationResult({
        outputPath: '/repo/design-systems/sys-01/docs/_spec/components/alert.yml',
        normalizedSpec: { name: 'Alert' },
        componentName: 'Alert',
        nodeId: '123:456',
        prefilledCount: 2,
        unresolvedTbdCount: 1,
        validationReport: {
          ok: true,
          summary: {
            errors: 0,
            warnings: 1,
          },
        },
        indicesSync: {
          changed: ['/repo/design-systems/sys-01/docs/components/overview.md'],
          written: ['/repo/design-systems/sys-01/docs/components/overview.md'],
          registry: {
            databaseUrl: '/repo/apps/ds-dashboard/server/db/ds-dashboard.db',
            fingerprint: 'abc123',
          },
          overview: {
            overviewPath: '/repo/design-systems/sys-01/docs/components/overview.md',
          },
        },
      });

      assert.deepEqual(result, {
        ok: true,
        outputPath: '/repo/design-systems/sys-01/docs/_spec/components/alert.yml',
        componentName: 'Alert',
        componentSetNodeId: '123:456',
        tokenPrefilled: 2,
        unresolvedTbdCount: 1,
        validation: {
          ok: true,
          errors: 0,
          warnings: 1,
        },
        documentationIndices: {
          changed: ['/repo/design-systems/sys-01/docs/components/overview.md'],
          written: ['/repo/design-systems/sys-01/docs/components/overview.md'],
          databaseUrl: '/repo/apps/ds-dashboard/server/db/ds-dashboard.db',
          registryFingerprint: 'abc123',
          overviewPath: '/repo/design-systems/sys-01/docs/components/overview.md',
        },
      });
    });

    it('returns skipped validation payload when report is not provided', () => {
      const result = buildSpecGenerationResult({
        outputPath: '/repo/design-systems/sys-01/docs/_spec/components/alert.yml',
        normalizedSpec: {},
        componentName: '',
        nodeId: '',
        prefilledCount: 0,
        unresolvedTbdCount: 0,
        validationReport: null,
        indicesSync: {
          changed: [],
          written: [],
          registry: {
            databaseUrl: '/repo/apps/ds-dashboard/server/db/ds-dashboard.db',
            fingerprint: 'fp',
          },
          overview: {
            overviewPath: '/repo/design-systems/sys-01/docs/components/overview.md',
          },
        },
      });

      assert.deepEqual(result.validation, { skipped: true });
      assert.equal(result.componentName, null);
      assert.equal(result.componentSetNodeId, null);
    });
  });
});

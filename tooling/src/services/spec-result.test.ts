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
        outputPath: '/repo/docs/_spec/components/alert.yml',
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
          changed: ['/repo/docs/components/overview.md'],
          written: ['/repo/docs/components/overview.md'],
          registry: {
            registryPath: '/repo/docs/_generated/component-registry.json',
            fingerprint: 'abc123',
          },
          overview: {
            overviewPath: '/repo/docs/components/overview.md',
          },
        },
      });

      assert.deepEqual(result, {
        ok: true,
        outputPath: '/repo/docs/_spec/components/alert.yml',
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
          changed: ['/repo/docs/components/overview.md'],
          written: ['/repo/docs/components/overview.md'],
          registryPath: '/repo/docs/_generated/component-registry.json',
          registryFingerprint: 'abc123',
          overviewPath: '/repo/docs/components/overview.md',
        },
      });
    });

    it('returns skipped validation payload when report is not provided', () => {
      const result = buildSpecGenerationResult({
        outputPath: '/repo/docs/_spec/components/alert.yml',
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
            registryPath: '/repo/docs/_generated/component-registry.json',
            fingerprint: 'fp',
          },
          overview: {
            overviewPath: '/repo/docs/components/overview.md',
          },
        },
      });

      assert.deepEqual(result.validation, { skipped: true });
      assert.equal(result.componentName, null);
      assert.equal(result.componentSetNodeId, null);
    });
  });
});

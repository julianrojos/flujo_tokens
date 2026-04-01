/**
 * Analysis Route Service Tests
 *
 * Tests for analysis route utilities.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildImpactFailure,
  parseImpactRequest,
} from './analysis-route-service.js';

describe('analysis-route-service', () => {
  describe('parseImpactRequest()', () => {
    it('requires tokenPath', () => {
      const invalid = parseImpactRequest({
        tokenPathRaw: ' ',
        newValueRaw: null,
        depthRaw: null,
      });
      assert.equal(invalid.ok, false);
      assert.equal((invalid as any).errorArgs.code, 'validation.token_path_required');

      const ok = parseImpactRequest({
        tokenPathRaw: 'color.primary',
        newValueRaw: ' #fff ',
        depthRaw: '3',
      });
      assert.equal(ok.ok, true);
      assert.equal((ok as any).payload.tokenPath, 'color.primary');
      assert.equal((ok as any).payload.newValue, '#fff');
      assert.equal((ok as any).payload.depth, 3);
    });
  });

  describe('buildImpactFailure()', () => {
    it('maps not found vs invalid request', () => {
      const notFound = buildImpactFailure('color.primary', new Error('token not found'));
      assert.equal(notFound.statusCode, 404);
      assert.equal(notFound.errorArgs.code, 'impact.token_not_found');

      const notFoundMixedCase = buildImpactFailure('color.primary', new Error('Token Not Found'));
      assert.equal(notFoundMixedCase.statusCode, 404);
      assert.equal(notFoundMixedCase.errorArgs.code, 'impact.token_not_found');

      const invalid = buildImpactFailure('color.primary', new Error('invalid payload'));
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.errorArgs.code, 'impact.invalid_request');
    });
  });
});

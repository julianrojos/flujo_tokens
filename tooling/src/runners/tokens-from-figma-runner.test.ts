import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveReportedSourceUsed } from './tokens-from-figma-runner.js';

describe('tokens-from-figma-runner', () => {
  describe('resolveReportedSourceUsed()', () => {
    it('returns explicit source used when provided', () => {
      assert.equal(resolveReportedSourceUsed('auto', 'mcp'), 'mcp');
      assert.equal(resolveReportedSourceUsed('rest', 'rest'), 'rest');
    });

    it('returns unknown when requested source is auto but used source is missing', () => {
      assert.equal(resolveReportedSourceUsed('auto', undefined), 'unknown');
    });

    it('falls back to requested concrete source when used source is missing', () => {
      assert.equal(resolveReportedSourceUsed('mcp', undefined), 'mcp');
      assert.equal(resolveReportedSourceUsed('rest', undefined), 'rest');
    });
  });
});

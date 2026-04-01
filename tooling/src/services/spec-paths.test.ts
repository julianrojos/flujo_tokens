/**
 * Spec Paths Tests
 *
 * Tests for buildSpecOutputPath function.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpecOutputPath } from './spec-paths.js';

describe('spec-paths', () => {
  describe('buildSpecOutputPath()', () => {
    it('explicit output wins over inferred output', () => {
      const output = buildSpecOutputPath(
        { output: 'design-systems/sys-01/docs/_spec/components/custom.yml' },
        'design-systems/sys-01/docs/_spec/components',
        'alert',
        '1:2'
      );
      assert.match(output, /custom\.yml$/);
    });

    it('component slug creates deterministic yml path', () => {
      const output = buildSpecOutputPath(
        {},
        'design-systems/sys-01/docs/_spec/components',
        'alert_banner',
        ''
      );
      assert.match(output, /alert_banner\.yml$/);
    });

    it('fallback uses node id when slug is not available', () => {
      const output = buildSpecOutputPath({}, 'design-systems/sys-01/docs/_spec/components', '', '12:34');
      assert.match(output, /component_12_34\.yml$/);
    });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseBooleanOption } from './parse-options.js';

describe('parse-options', () => {
  describe('parseBooleanOption', () => {
    it('accepts common truthy and falsy string forms', () => {
      assert.equal(parseBooleanOption('true', '--flag'), true);
      assert.equal(parseBooleanOption('1', '--flag'), true);
      assert.equal(parseBooleanOption('yes', '--flag'), true);
      assert.equal(parseBooleanOption('false', '--flag'), false);
      assert.equal(parseBooleanOption('0', '--flag'), false);
      assert.equal(parseBooleanOption('no', '--flag'), false);
    });

    it('uses the fallback when value is undefined', () => {
      assert.equal(parseBooleanOption(undefined, '--flag', true), true);
      assert.equal(parseBooleanOption(undefined, '--flag', false), false);
    });

    it('rejects invalid boolean values', () => {
      assert.throws(() => parseBooleanOption('maybe', '--flag'));
    });
  });
});

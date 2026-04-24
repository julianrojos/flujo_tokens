import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isCssVarRef, isPrimitiveValue } from './token-utils.js';

describe('token-utils', () => {
  it('keeps css var reference detection stable across repeated calls', () => {
    assert.equal(isCssVarRef('var(--color-primary)'), true);
    assert.equal(isCssVarRef('var(--color-primary)'), true);
    assert.equal(isPrimitiveValue('var(--color-primary)'), false);
    assert.equal(isPrimitiveValue('var(--color-primary)'), false);
  });
});

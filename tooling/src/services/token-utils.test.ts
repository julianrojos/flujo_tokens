import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getTokenAliases, isCssVarRef, isPrimitiveValue } from './token-utils.js';

describe('token-utils', () => {
  it('keeps css var reference detection stable across repeated calls', () => {
    assert.equal(isCssVarRef('var(--color-primary)'), true);
    assert.equal(isCssVarRef('var(--color-primary)'), true);
    assert.equal(isPrimitiveValue('var(--color-primary)'), false);
    assert.equal(isPrimitiveValue('var(--color-primary)'), false);
  });

  it('resolves token aliases via css var reference and explicit alias ids', () => {
    const registry = {
      entries: [
        { id: 'token-1', path: 'Primitives/Color/Primary', cssVar: '--color-primary', $value: '#fff', collection: 'Primitives', aliases: undefined },
        { id: 'token-2', path: 'Primitives/Color/Secondary', cssVar: '--color-secondary', $value: 'var(--color-primary)', collection: 'Primitives', aliases: ['token-1'] },
      ],
    } as never;

    const aliases = getTokenAliases(registry, 'token-1');
    assert.equal(aliases.length, 1);
    assert.equal(aliases[0].id, 'token-2');
  });
});

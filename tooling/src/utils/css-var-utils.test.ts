import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveUniqueCssVar,
  toCssVarSuffix,
} from './css-var-utils.js';

describe('css-var-utils', () => {
  it('normalizes suffixes and limits their length', () => {
    assert.equal(toCssVarSuffix('  Áccents / and spaces  '), 'accents-and-spaces');
    assert.equal(
      toCssVarSuffix('x'.repeat(100)),
      'x'.repeat(48),
    );
  });

  it('resolves collisions deterministically', () => {
    const used = new Set<string>();
    const first = resolveUniqueCssVar({
      baseCssVar: '--color-background-primary',
      collection: 'Semantic',
      variableId: '123:456',
      usedCssVars: used,
    });
    const second = resolveUniqueCssVar({
      baseCssVar: '--color-background-primary',
      collection: 'Semantic',
      variableId: '123:789',
      usedCssVars: used,
    });
    const third = resolveUniqueCssVar({
      baseCssVar: '--color-background-primary',
      collection: 'Semantic',
      variableId: '123:789',
      usedCssVars: used,
    });

    assert.equal(first, '--color-background-primary');
    assert.equal(second, '--color-background-primary-semantic');
    assert.equal(third, '--color-background-primary-123-789');
  });
});

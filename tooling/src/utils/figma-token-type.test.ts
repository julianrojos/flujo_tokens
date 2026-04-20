import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeTokenTypeFromFigma } from '@flujo/shared';

describe('normalizeTokenTypeFromFigma', () => {
  it('maps COLOR to color', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'COLOR',
        variableName: 'Background/Brand/Default',
      }),
      'color',
    );
  });

  it('maps FLOAT font-weight variables to fontWeight', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'FLOAT',
        variableName: 'Body/Font Weight Regular',
      }),
      'fontWeight',
    );
  });

  it('keeps non-font-weight FLOAT variables as dimension', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'FLOAT',
        variableName: 'Body/Size Large',
      }),
      'dimension',
    );
  });

  it('maps STRING font-family variables to fontFamily', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'STRING',
        variableName: 'Body/Font Family',
      }),
      'fontFamily',
    );
  });

  it('maps Family-prefixed STRING variables to fontFamily', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'STRING',
        variableName: 'Family Mono',
      }),
      'fontFamily',
    );
  });

  it('keeps other STRING variables as string', () => {
    assert.equal(
      normalizeTokenTypeFromFigma({
        resolvedType: 'STRING',
        variableName: 'Device',
      }),
      'string',
    );
  });
});

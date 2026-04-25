import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InvalidFigmaVariableSourceError,
  isFigmaVariableSource,
  parseFigmaVariableSource,
} from './figma-variable-source.js';

describe('figma-variable-source', () => {
  it('returns default auto when value is missing', () => {
    assert.equal(parseFigmaVariableSource(undefined), 'auto');
    assert.equal(parseFigmaVariableSource(''), 'auto');
  });

  it('parses supported values with trimming and lowercase normalization', () => {
    assert.equal(parseFigmaVariableSource('mcp'), 'mcp');
    assert.equal(parseFigmaVariableSource(' rest '), 'rest');
    assert.equal(parseFigmaVariableSource('AUTO'), 'auto');
  });

  it('supports custom default value', () => {
    assert.equal(
      parseFigmaVariableSource(undefined, { defaultValue: 'rest' }),
      'rest',
    );
  });

  it('throws InvalidFigmaVariableSourceError for unsupported values', () => {
    assert.throws(
      () => parseFigmaVariableSource('ftp', { optionName: '--source' }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidFigmaVariableSourceError);
        assert.equal(error.optionName, '--source');
        assert.equal(error.rawValue, 'ftp');
        assert.match(error.message, /Invalid --source value/);
        return true;
      },
    );
  });

  it('recognizes supported values through the shared guard', () => {
    assert.equal(isFigmaVariableSource('auto'), true);
    assert.equal(isFigmaVariableSource('mcp'), true);
    assert.equal(isFigmaVariableSource('rest'), true);
    assert.equal(isFigmaVariableSource('ftp'), false);
  });
});

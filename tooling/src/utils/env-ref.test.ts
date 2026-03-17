import assert from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeEnvRef, resolveEnvRef } from './env-ref.js';

describe('env-ref utils', () => {
  describe('normalizeEnvRef', () => {
    it('normalizes plain identifier to ${VAR}', () => {
      assert.equal(normalizeEnvRef('FIGMA_TOKEN'), '${FIGMA_TOKEN}');
    });

    it('normalizes $VAR to ${VAR}', () => {
      assert.equal(normalizeEnvRef('$FIGMA_TOKEN'), '${FIGMA_TOKEN}');
    });

    it('keeps ${VAR} idempotent', () => {
      assert.equal(normalizeEnvRef('${FIGMA_TOKEN}'), '${FIGMA_TOKEN}');
    });

    it('keeps literal token value unchanged', () => {
      assert.equal(normalizeEnvRef('figd-abc123'), 'figd-abc123');
    });
  });

  describe('resolveEnvRef', () => {
    it('resolves ${VAR} from process.env', () => {
      const key = 'FIGMA_TOKEN_CACA_TEST';
      const prev = process.env[key];
      process.env[key] = 'tok';
      try {
        assert.equal(resolveEnvRef('${FIGMA_TOKEN_CACA_TEST}'), 'tok');
      } finally {
        if (prev === undefined) delete process.env[key];
        else process.env[key] = prev;
      }
    });

    it('passes through literal values unchanged', () => {
      assert.equal(resolveEnvRef('figd-abc123'), 'figd-abc123');
    });

    it('returns empty string for undefined', () => {
      assert.equal(resolveEnvRef(undefined), '');
    });
  });
});

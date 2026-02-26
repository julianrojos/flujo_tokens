import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as path from 'node:path';
import { buildSpecOutputPath } from './spec-paths.js';

describe('buildSpecOutputPath', () => {
  it('returns explicit output path when provided', () => {
    const result = buildSpecOutputPath(
      { output: '/custom/path/button.yml' },
      'docs/_spec/components',
      'button',
      '1:2',
    );
    assert.strictEqual(result, '/custom/path/button.yml');
  });

  it('builds path from componentSlug when output is not provided', () => {
    const result = buildSpecOutputPath(
      {},
      'docs/_spec/components',
      'button',
      '1:2',
    );
    assert.strictEqual(result, path.resolve('docs/_spec/components/button.yml'));
  });

  it('builds path from nodeId when componentSlug is not provided', () => {
    const result = buildSpecOutputPath(
      {},
      'docs/_spec/components',
      undefined as any,
      '1:2',
    );
    assert.strictEqual(result, path.resolve('docs/_spec/components/component_1_2.yml'));
  });

  it('returns empty string when no output, slug, or nodeId is provided', () => {
    const result = buildSpecOutputPath(
      {},
      'docs/_spec/components',
      undefined as any,
      undefined as any,
    );
    assert.strictEqual(result, '');
  });

  it('prioritizes output over componentSlug', () => {
    const result = buildSpecOutputPath(
      { output: '/custom.yml' },
      'docs/_spec/components',
      'button',
      '1:2',
    );
    assert.strictEqual(result, '/custom.yml');
  });

  it('prioritizes componentSlug over nodeId', () => {
    const result = buildSpecOutputPath(
      {},
      'docs/_spec/components',
      'button',
      '1:2',
    );
    assert.strictEqual(result, path.resolve('docs/_spec/components/button.yml'));
  });

  it('handles nodeId with colon separator', () => {
    const result = buildSpecOutputPath(
      {},
      'docs/_spec/components',
      undefined as any,
      '123:456',
    );
    assert.strictEqual(result, path.resolve('docs/_spec/components/component_123_456.yml'));
  });
});

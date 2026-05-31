import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeVisualProofFromRepositoryEntry,
  resolveVisualProofVariantsCount,
} from './visual-proof-normalizer.js';

describe('visual-proof-normalizer', () => {
  it('uses DB variants_count and warns when it diverges from variants length', () => {
    const warnings: string[] = [];
    const normalized = normalizeVisualProofFromRepositoryEntry(
      {
        imagePath: 'design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
        variantsCount: 3,
        variants: [{ name: 'A' }],
      },
      (message: string) => warnings.push(message),
    ) as Record<string, unknown>;

    assert.equal(normalized.variants_count, 3);
    assert.equal(Array.isArray(normalized.variants), true);
    assert.equal((normalized.variants as unknown[]).length, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /variants_count mismatch/i);
  });

  it('falls back to variants length when DB count is not finite', () => {
    const count = resolveVisualProofVariantsCount({
      value: null,
      variantsLength: 2,
      warn: () => {},
    });
    assert.equal(count, 2);
  });

  it('warns when variants payload is invalid (non-array)', () => {
    const warnings: string[] = [];
    const normalized = normalizeVisualProofFromRepositoryEntry(
      {
        imagePath: 'design-systems/sys-01/docs/_generated/visual-proofs/images/button.png',
        variants: 'invalid',
      },
      (message: string) => warnings.push(message),
    );

    assert.ok(normalized);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not an array/i);
  });

  it('keeps proof when variantsCount indicates evidence even without variants array/image/screenshot', () => {
    const normalized = normalizeVisualProofFromRepositoryEntry(
      {
        variantsCount: 3,
      },
      () => {},
    ) as Record<string, unknown>;

    assert.ok(normalized);
    assert.equal(normalized.variants_count, 3);
    assert.ok(Array.isArray(normalized.variants));
    assert.equal((normalized.variants as unknown[]).length, 0);
  });
});

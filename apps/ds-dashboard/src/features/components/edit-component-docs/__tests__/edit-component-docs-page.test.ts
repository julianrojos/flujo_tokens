import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFormDataFromDraft,
  isOptimisticSaveError,
  normalizeAccessibilityForSave,
} from '../edit-component-docs-page';

describe('edit-component-docs-page draft restoration', () => {
  it('preserves an explicitly cleared accessibility guidance draft', () => {
    const fallback = {
      summary: { purpose: '', whenToUse: '', whenNotToUse: '' },
      behaviour: '',
      variants: [],
      contentGuidelines: [],
      accessibility: {
        role: 'button',
        guidance: ['Existing guidance'],
      },
    };

    const restored = buildFormDataFromDraft(
      {
        accessibility: {
          role: 'button',
          guidance: [],
        },
      },
      fallback,
    );

    assert.deepEqual(restored.accessibility, {
      role: 'button',
      guidance: [],
    });
  });
});

describe('edit-component-docs-page accessibility serialization', () => {
  it('clears legacy accessibility notes when saving unified guidance', () => {
    const serialized = normalizeAccessibilityForSave({
      role: 'button',
      guidance: ['Provide an accessible name'],
    });

    assert.deepEqual(serialized, {
      role: 'button',
      labeling: { rules: ['Provide an accessible name'] },
      notes: null,
    });
  });
});

describe('edit-component-docs-page save error handling', () => {
  it('detects optimistic lock save errors by status or code', () => {
    assert.equal(
      isOptimisticSaveError({ status: 409, message: 'Conflict' }),
      true,
    );
    assert.equal(
      isOptimisticSaveError({ code: 'optimistic_lock_failed', message: 'Conflict' }),
      true,
    );
    assert.equal(
      isOptimisticSaveError({ status: 500, code: 'internal.editorial_upsert_failed' }),
      false,
    );
  });
});

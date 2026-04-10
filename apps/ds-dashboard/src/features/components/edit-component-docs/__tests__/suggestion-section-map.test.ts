import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTION_SECTION_MAP, SECTION_ORDER, applySectionAction, type SectionId } from '../constants/suggestion-section-map';

describe('suggestion-section-map', () => {
  it('excludes tokens from supported sections', () => {
    const sectionIds = Object.keys(SUGGESTION_SECTION_MAP) as SectionId[];
    assert.deepStrictEqual(sectionIds, ['summary', 'variants', 'accessibilityNotes']);
    assert.ok(!sectionIds.includes('tokens' as never));
  });

  it('excludes tokens from section order', () => {
    assert.ok(!SECTION_ORDER.includes('tokens' as never));
  });

  it('extracts summary from suggestion', () => {
    const suggestion = { summary: 'A button', variants: [], accessibilityNotes: [] };
    assert.equal(SUGGESTION_SECTION_MAP.summary.extract(suggestion as never), 'A button');
  });

  it('extracts variants from suggestion', () => {
    const suggestion = { summary: '', variants: [{ id: '1', name: 'Default', description: '', properties: {} }], accessibilityNotes: [] };
    const result = SUGGESTION_SECTION_MAP.variants.extract(suggestion as never);
    assert.equal((result as unknown[]).length, 1);
  });

  it('applies summary', () => {
    const result = applySectionAction({ type: 'SET_SUMMARY', payload: 'New summary' }, {});
    assert.equal(result.summary, 'New summary');
  });

  it('applies variants', () => {
    const variants = [{ id: '1', name: 'Default', description: '', properties: {} }];
    const result = applySectionAction({ type: 'SET_VARIANTS', payload: variants }, {});
    assert.deepEqual(result.variants, variants);
  });

  it('applies accessibility notes', () => {
    const notes = ['Has accessible label'];
    const result = applySectionAction({ type: 'SET_ACC_NOTES', payload: notes }, {});
    assert.deepEqual(result.accessibilityNotes, notes);
  });

  it('returns unchanged state for unknown action type', () => {
    const base = { summary: 'test' };
    const result = applySectionAction({ type: 'UNKNOWN' as never, payload: '' } as never, base);
    assert.deepEqual(result, base);
  });
});

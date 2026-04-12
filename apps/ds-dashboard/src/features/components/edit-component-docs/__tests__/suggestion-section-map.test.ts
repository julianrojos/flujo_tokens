import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTION_SECTION_MAP, SECTION_ORDER, applySectionAction, type SectionId } from '../constants/suggestion-section-map';

const suggestion = {
  output: {
    schemaVersion: 2,
    componentId: '123:456',
    title: 'Button',
    summary: 'Primary action button',
    variants: [{ id: '1', name: 'Default', description: '', properties: {} }],
    accessibilityNotes: ['Accessible note'],
    markdown: '# Button',
    states: [],
    accessibilityFacts: [],
  },
  editorialPatch: {
    schemaVersion: 2,
    summary: {
      purpose: 'Primary action button',
      when_to_use: 'Use for main actions',
      when_not_to_use: 'Do not use for destructive actions',
    },
    best_practices: {
      do: ['Keep labels short'],
      dont: ['Use vague wording'],
    },
    content_guidelines: {
      rules: ['Start with a verb'],
    },
    accessibility: {
      role: 'button',
      labeling: {
        rules: ['Provide an accessible name'],
      },
      notes: ['Supports keyboard activation'],
    },
  },
};

describe('suggestion-section-map', () => {
  it('supports the current editorial suggestion sections', () => {
    const sectionIds = Object.keys(SUGGESTION_SECTION_MAP) as SectionId[];
    assert.deepStrictEqual(sectionIds, ['summary', 'variants', 'bestPractices', 'contentGuidelines', 'accessibility']);
    assert.ok(!sectionIds.includes('tokens' as never));
  });

  it('orders sections without tokens or properties', () => {
    assert.deepStrictEqual(SECTION_ORDER, ['summary', 'variants', 'bestPractices', 'contentGuidelines', 'accessibility']);
  });

  it('extracts structured summary from editorial patch', () => {
    const result = SUGGESTION_SECTION_MAP.summary.extract(suggestion as never);
    assert.deepStrictEqual(result, {
      purpose: 'Primary action button',
      whenToUse: 'Use for main actions',
      whenNotToUse: 'Do not use for destructive actions',
    });
  });

  it('extracts best practices from editorial patch', () => {
    const result = SUGGESTION_SECTION_MAP.bestPractices.extract(suggestion as never);
    assert.deepStrictEqual(result, {
      do: ['Keep labels short'],
      dont: ['Use vague wording'],
    });
  });

  it('falls back to factual accessibility notes when patch notes are missing', () => {
    const result = SUGGESTION_SECTION_MAP.accessibility.extract({
      ...suggestion,
      editorialPatch: {
        ...suggestion.editorialPatch,
        accessibility: {
          role: 'button',
          labeling: { rules: [] },
          notes: [],
        },
      },
    } as never);
    assert.deepStrictEqual(result, {
      role: 'button',
      labelingRules: [],
      notes: ['Accessible note'],
    });
  });

  it('applies summary payload', () => {
    const result = applySectionAction({
      type: 'SET_SUMMARY',
      payload: { purpose: 'New summary', whenToUse: 'Use', whenNotToUse: 'Avoid' },
    }, {});
    assert.deepEqual(result.summary, { purpose: 'New summary', whenToUse: 'Use', whenNotToUse: 'Avoid' });
  });

  it('applies best practices payload', () => {
    const payload = { do: ['Do'], dont: ['Dont'] };
    const result = applySectionAction({ type: 'SET_BEST_PRACTICES', payload }, {});
    assert.deepEqual(result.bestPractices, payload);
  });

  it('applies accessibility payload', () => {
    const payload = { role: 'button', labelingRules: ['Rule'], notes: ['Note'] };
    const result = applySectionAction({ type: 'SET_ACCESSIBILITY', payload }, {});
    assert.deepEqual(result.accessibility, payload);
  });

  it('returns unchanged state for unknown action type', () => {
    const base = { summary: { purpose: 'test' } };
    const result = applySectionAction({ type: 'UNKNOWN' as never, payload: '' } as never, base);
    assert.deepEqual(result, base);
  });
});

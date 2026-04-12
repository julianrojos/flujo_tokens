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
    assert.deepStrictEqual(sectionIds, ['summary', 'variants', 'contentGuidelines', 'accessibility']);
    assert.ok(!sectionIds.includes('tokens' as never));
  });

  it('orders sections without tokens or properties', () => {
    assert.deepStrictEqual(SECTION_ORDER, ['summary', 'variants', 'contentGuidelines', 'accessibility']);
  });

  it('extracts structured summary from editorial patch', () => {
    const result = SUGGESTION_SECTION_MAP.summary.extract(suggestion as never);
    assert.deepStrictEqual(result, {
      purpose: 'Primary action button',
      whenToUse: 'Use for main actions',
      whenNotToUse: 'Do not use for destructive actions',
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
      guidance: ['Accessible note'],
    });
  });

  it('prefers editorial accessibility guidance over factual accessibility notes', () => {
    const result = SUGGESTION_SECTION_MAP.accessibility.extract({
      ...suggestion,
      output: {
        ...suggestion.output,
        accessibilityNotes: ['Factual note that should not be merged'],
      },
      editorialPatch: {
        ...suggestion.editorialPatch,
        accessibility: {
          role: 'button',
          labeling: { rules: ['Provide an accessible name'] },
          notes: ['Supports keyboard activation'],
        },
      },
    } as never);

    assert.deepStrictEqual(result, {
      role: 'button',
      guidance: ['Provide an accessible name', 'Supports keyboard activation'],
    });
  });

  it('applies summary payload', () => {
    const result = applySectionAction({
      type: 'SET_SUMMARY',
      payload: { purpose: 'New summary', whenToUse: 'Use', whenNotToUse: 'Avoid' },
    }, {});
    assert.deepEqual(result.summary, { purpose: 'New summary', whenToUse: 'Use', whenNotToUse: 'Avoid' });
  });

  it('applies accessibility payload', () => {
    const payload = { role: 'button', guidance: ['Rule', 'Note'] };
    const result = applySectionAction({ type: 'SET_ACCESSIBILITY', payload }, {});
    assert.deepEqual(result.accessibility, payload);
  });

  it('returns unchanged state for unknown action type', () => {
    const base = { summary: { purpose: 'test' } };
    const result = applySectionAction({ type: 'UNKNOWN' as never, payload: '' } as never, base);
    assert.deepEqual(result, base);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SummarySuggestionCard,
  VariantsSuggestionCard,
  ContentGuidelinesSuggestionCard,
  AccessibilitySuggestionCard,
} from '../components/ai-suggestions-panel';

describe('AiSuggestionsPanel cards', () => {
  it('renders structured summary suggestion card', () => {
    const html = renderToStaticMarkup(
      React.createElement(SummarySuggestionCard, {
        value: {
          purpose: 'A button component for primary actions',
          whenToUse: 'Use for the main action',
          whenNotToUse: 'Avoid for secondary actions',
        },
        onApply: () => {},
      }),
    );
    assert.match(html, /Summary/);
    assert.match(html, /A button component for primary actions/);
    assert.match(html, /When to use/);
    assert.match(html, /When not to use/);
  });

  it('renders variants suggestion card', () => {
    const variants = [
      { id: '1', name: 'Default', description: 'Default state', properties: { State: 'Default' } },
      { id: '2', name: 'Hover', description: 'Hover state', properties: { State: 'Hover' } },
    ];
    const html = renderToStaticMarkup(
      React.createElement(VariantsSuggestionCard, {
        value: variants,
        onApply: () => {},
      }),
    );
    assert.match(html, /Variants/);
    assert.match(html, /2 variants/);
    assert.match(html, /Default/);
    assert.match(html, /Hover/);
  });

  it('renders content guidelines suggestion card', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContentGuidelinesSuggestionCard, {
        value: ['Start labels with a verb'],
        onApply: () => {},
      }),
    );
    assert.match(html, /Content Guidelines/);
    assert.match(html, /Start labels with a verb/);
  });

  it('renders accessibility suggestion card with role and labeling rules', () => {
    const html = renderToStaticMarkup(
      React.createElement(AccessibilitySuggestionCard, {
        value: {
          role: 'button',
          labelingRules: ['Provide an accessible name'],
          notes: ['Supports keyboard activation'],
        },
        onApply: () => {},
      }),
    );
    assert.match(html, /Accessibility/);
    assert.match(html, /button/);
    assert.match(html, /Provide an accessible name/);
    assert.match(html, /Supports keyboard activation/);
  });

  it('does not render any tokens section in suggestion cards', () => {
    const html = renderToStaticMarkup(
      React.createElement('div', {}, [
        React.createElement(SummarySuggestionCard, {
          key: 'summary',
          value: { purpose: 'A button', whenToUse: '', whenNotToUse: '' },
          onApply: () => {},
        }),
        React.createElement(VariantsSuggestionCard, {
          key: 'variants',
          value: [],
          onApply: () => {},
        }),
        React.createElement(ContentGuidelinesSuggestionCard, {
          key: 'content-guidelines',
          value: [],
          onApply: () => {},
        }),
        React.createElement(AccessibilitySuggestionCard, {
          key: 'accessibility',
          value: { role: '', labelingRules: [], notes: [] },
          onApply: () => {},
        }),
      ]),
    );
    assert.doesNotMatch(html, />Tokens</);
  });
});

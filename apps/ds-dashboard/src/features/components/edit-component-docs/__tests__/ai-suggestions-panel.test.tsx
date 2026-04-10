import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SummarySuggestionCard,
  VariantsSuggestionCard,
  AccessibilitySuggestionCard,
} from '../components/ai-suggestions-panel';

describe('AiSuggestionsPanel cards', () => {
  it('renders summary suggestion card', () => {
    const html = renderToStaticMarkup(
      React.createElement(SummarySuggestionCard, {
        value: 'A button component for primary actions',
        onApply: () => {},
      }),
    );
    assert.match(html, /Summary/);
    assert.match(html, /A button component for primary actions/);
    assert.match(html, /Use this/);
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

  it('renders empty variants state', () => {
    const html = renderToStaticMarkup(
      React.createElement(VariantsSuggestionCard, {
        value: [],
        onApply: () => {},
      }),
    );
    assert.match(html, /No variants in suggestion/);
  });

  it('renders accessibility suggestion card', () => {
    const notes = ['Has accessible name', 'Supports keyboard navigation'];
    const html = renderToStaticMarkup(
      React.createElement(AccessibilitySuggestionCard, {
        value: notes,
        onApply: () => {},
      }),
    );
    assert.match(html, /Accessibility/);
    assert.match(html, /Has accessible name/);
    assert.match(html, /Supports keyboard navigation/);
  });

  it('renders empty accessibility state', () => {
    const html = renderToStaticMarkup(
      React.createElement(AccessibilitySuggestionCard, {
        value: [],
        onApply: () => {},
      }),
    );
    assert.match(html, /No accessibility notes in suggestion/);
  });

  it('does not render any tokens section in suggestion cards', () => {
    const html = renderToStaticMarkup(
      React.createElement('div', {}, [
        React.createElement(SummarySuggestionCard, {
          key: 'summary',
          value: 'A button component for primary actions',
          onApply: () => {},
        }),
        React.createElement(VariantsSuggestionCard, {
          key: 'variants',
          value: [],
          onApply: () => {},
        }),
        React.createElement(AccessibilitySuggestionCard, {
          key: 'accessibility',
          value: [],
          onApply: () => {},
        }),
      ]),
    );
    assert.doesNotMatch(html, />Tokens</);
  });
});

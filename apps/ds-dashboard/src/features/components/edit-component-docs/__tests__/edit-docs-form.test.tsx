import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PropertiesFormCard,
  SummaryFormCard,
  VariantsFormCard,
  AccessibilityFormCard,
} from '../components/edit-docs-form';

describe('EditDocsForm cards', () => {
  it('renders add property affordance for variants', () => {
    const html = renderToStaticMarkup(
      React.createElement(VariantsFormCard, {
        value: [
          { id: 'variant-1', name: 'Default', description: 'Default variant', properties: {} },
        ],
        onChange: () => {},
      }),
    );

    assert.match(html, /Add property/);
  });

  it('uses positional fallback in remove variant aria-label when name is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(VariantsFormCard, {
        value: [
          { id: 'variant-1', name: '', description: '', properties: {} },
        ],
        onChange: () => {},
      }),
    );

    assert.match(html, /aria-label="Remove variant 1"/);
  });

  it('renders remove property control for existing variant properties', () => {
    const html = renderToStaticMarkup(
      React.createElement(VariantsFormCard, {
        value: [
          { id: 'variant-1', name: 'Default', description: '', properties: { State: 'Default' } },
        ],
        onChange: () => {},
      }),
    );

    assert.match(html, /aria-label="Remove property State from variant Default"/);
  });

  it('renders when-to-use and when-not-to-use summary fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(SummaryFormCard, {
        value: { purpose: 'Primary action', whenToUse: 'Use for main CTA', whenNotToUse: 'Avoid in dense lists' },
        onChange: () => {},
      }),
    );

    assert.match(html, /When to use/);
    assert.match(html, /When not to use/);
  });

  it('renders add property affordance for top-level properties', () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertiesFormCard, {
        value: [],
        onChange: () => {},
      }),
    );

    assert.match(html, /Add property/);
    assert.match(html, /No top-level properties yet/);
  });

  it('renders accessibility role and labeling rules fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(AccessibilityFormCard, {
        value: { role: 'button', labelingRules: ['Provide accessible name'], notes: ['Keyboard accessible'] },
        onChange: () => {},
      }),
    );

    assert.match(html, /Role/);
    assert.match(html, /Accessibility Labeling Rules/);
    assert.match(html, /Accessibility Notes/);
  });
});

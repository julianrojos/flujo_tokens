import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BehaviourFormCard,
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

  it('renders behaviour field', () => {
    const html = renderToStaticMarkup(
      React.createElement(BehaviourFormCard, {
        value: 'Opens a menu when activated.',
        onChange: () => {},
      }),
    );

    assert.match(html, /Behaviour/);
    assert.match(html, /Opens a menu when activated/);
  });

  it('renders accessibility role and guidance fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(AccessibilityFormCard, {
        value: { role: 'button', guidance: ['Provide accessible name', 'Keyboard accessible'] },
        onChange: () => {},
      }),
    );

    assert.match(html, /Role/);
    assert.match(html, /Select a role/);
    assert.match(html, /<option value="button" selected="">button<\/option>/);
    assert.match(html, /<option value="alert">alert<\/option>/);
    assert.match(html, /<option value="dialog">dialog<\/option>/);
    assert.match(html, /Accessibility Guidance/);
    assert.match(html, /Provide accessible name/);
    assert.match(html, /Keyboard accessible/);
  });
});

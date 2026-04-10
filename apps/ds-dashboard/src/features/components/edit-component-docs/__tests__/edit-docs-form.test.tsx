import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VariantsFormCard } from '../components/edit-docs-form';

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
});

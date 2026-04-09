import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TokensSuggestionCard } from '../components/ai-suggestions-panel';
import type { TokenEntry, TokenRegistry } from '@/types/token-registry';

function makeEntry(partial: Partial<TokenEntry>): TokenEntry {
  return {
    path: partial.path ?? '',
    slashPath: partial.slashPath ?? (partial.path?.replace(/\./g, '/') ?? ''),
    cssVar: partial.cssVar ?? '--x',
    type: partial.type ?? 'color',
    resolvedValue: partial.resolvedValue ?? '',
    aliasOf: partial.aliasOf ?? null,
    collection: partial.collection ?? 'Core',
  };
}

function makeRegistry(entries: TokenEntry[]): TokenRegistry {
  const byPath: Record<string, TokenEntry> = {};
  const bySlashPath: Record<string, TokenEntry> = {};
  const byVariableId: Record<string, TokenEntry> = {};
  for (const entry of entries) {
    byPath[entry.path] = entry;
    bySlashPath[entry.slashPath] = entry;
  }
  return { entries, byPath, bySlashPath, byVariableId };
}

const EMPTY_TOKEN_REGISTRY: TokenRegistry = {
  entries: [],
  byPath: {},
  bySlashPath: {},
  byVariableId: {},
};

describe('TokensSuggestionCard', () => {
  it('renders alias + resolved value when token registry can resolve token refs', () => {
    const tokenRegistry = makeRegistry([
      makeEntry({
        path: 'color.background.accent',
        slashPath: 'color/background/accent',
        cssVar: '--color-background-accent',
        resolvedValue: 'color.brand.primary',
        aliasOf: 'color.brand.primary',
      }),
      makeEntry({
        path: 'color.brand.primary',
        slashPath: 'color/brand/primary',
        cssVar: '--color-brand-primary',
        resolvedValue: '#5B6CFF',
        aliasOf: null,
      }),
    ]);

    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'fill', value: 'color.background.accent', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={tokenRegistry}
      />,
    );

    assert.match(
      html,
      /fill/,
    );
    assert.match(
      html,
      /color\.background\.accent \[color\.brand\.primary = #5B6CFF\]/,
    );
  });

  it('falls back to readable token name when value is unresolved VariableID', () => {
    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'fill', value: 'VariableID:1:12', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={EMPTY_TOKEN_REGISTRY}
      />,
    );

    assert.doesNotMatch(html, /VariableID:1:12/);
    // displayName and displayValue both resolve to "fill" — duplicate is suppressed.
    assert.match(html, /<code[^>]*>fill<\/code>/i);
  });

  it('resolves VariableID to token path + alias with resolved value', () => {
    const accent = makeEntry({
      path: 'color.background.accent',
      slashPath: 'color/background/accent',
      cssVar: '--color-background-accent',
      resolvedValue: 'color.brand.primary',
      aliasOf: 'color.brand.primary',
    });
    const brandPrimary = makeEntry({
      path: 'color.brand.primary',
      slashPath: 'color/brand/primary',
      cssVar: '--color-brand-primary',
      resolvedValue: '#5B6CFF',
      aliasOf: null,
    });
    const tokenRegistry = makeRegistry([accent, brandPrimary]);
    tokenRegistry.byVariableId['VariableID:1:12'] = accent;

    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'fill', value: 'VariableID:1:12', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={tokenRegistry}
      />,
    );

    assert.match(
      html,
      /color\.background\.accent \[color\.brand\.primary = #5B6CFF\]/,
    );
  });

  it('resolves mixed VariableID + css var strings to readable token format', () => {
    const accent = makeEntry({
      path: 'color.background.accent',
      slashPath: 'color/background/accent',
      cssVar: '--color-accent-bg',
      resolvedValue: 'color.brand.primary',
      aliasOf: 'color.brand.primary',
    });
    const brandPrimary = makeEntry({
      path: 'color.brand.primary',
      slashPath: 'color/brand/primary',
      cssVar: '--color-brand-primary',
      resolvedValue: '#5B6CFF',
      aliasOf: null,
    });
    const tokenRegistry = makeRegistry([accent, brandPrimary]);
    tokenRegistry.byVariableId['VariableID:1:12'] = accent;

    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'background', value: 'VariableID:1:12 var(--color-accent-bg)""', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={tokenRegistry}
      />,
    );

    assert.match(
      html,
      /color\.background\.accent \[color\.brand\.primary = #5B6CFF\]/,
    );
  });

  it('does not render raw VariableID when token name is an opaque reference', () => {
    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'VariableID:1:12', value: '[Color Token]', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={EMPTY_TOKEN_REGISTRY}
      />,
    );

    assert.doesNotMatch(html, /VariableID:1:12/);
    // Brackets are stripped from the display name.
    assert.match(html, /<code[^>]*>Color Token<\/code>/i);
  });

  it('deduplicates placeholder label when name and value are the same bracketed token text', () => {
    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: '[color token]', value: '[color token]', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={EMPTY_TOKEN_REGISTRY}
      />,
    );

    // Name and value normalize to the same string — duplicate value span is suppressed.
    assert.match(html, /\[color token\]<\/code>/i);
    assert.doesNotMatch(html, /<span[^>]*>color token<\/span>/i);
  });

  it('hides VariableID value when name already provides readable token label', () => {
    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'button-accent-fill', value: 'VariableID:1:12', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={EMPTY_TOKEN_REGISTRY}
      />,
    );

    assert.doesNotMatch(html, /VariableID:1:12/);
    assert.match(html, /button-accent-fill/);
  });

  it('resolves kebab-case token names through dot/slash heuristic when registry has path', () => {
    const tokenRegistry = makeRegistry([
      makeEntry({
        path: 'button.accent.fill',
        slashPath: 'button/accent/fill',
        cssVar: '--button-accent-fill',
        resolvedValue: '#5B6CFF',
      }),
    ]);

    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'button-accent-fill', value: 'VariableID:1:12', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={tokenRegistry}
      />,
    );

    assert.match(html, /button\.accent\.fill \[#5B6CFF\]/);
  });
});

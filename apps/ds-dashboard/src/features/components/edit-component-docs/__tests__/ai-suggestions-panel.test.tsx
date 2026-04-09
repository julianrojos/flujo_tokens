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
  for (const entry of entries) {
    byPath[entry.path] = entry;
    bySlashPath[entry.slashPath] = entry;
  }
  return { entries, byPath, bySlashPath };
}

const EMPTY_TOKEN_REGISTRY: TokenRegistry = {
  entries: [],
  byPath: {},
  bySlashPath: {},
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

  it('falls back to raw token text when registry cannot resolve value', () => {
    const html = renderToStaticMarkup(
      <TokensSuggestionCard
        value={[{ name: 'fill', value: 'VariableID:1:12', type: 'color' }]}
        onApply={() => {}}
        tokenRegistry={EMPTY_TOKEN_REGISTRY}
      />,
    );

    assert.match(html, /VariableID:1:12/);
  });
});

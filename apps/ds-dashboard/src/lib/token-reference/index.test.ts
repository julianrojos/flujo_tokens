import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveVariableRef, formatVariableRef } from './index.js';
import type { TokenCatalog, TokenCatalogEntry } from '@/types/token-catalog';

function makeEntry(partial: Partial<TokenCatalogEntry>): TokenCatalogEntry {
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

function makeRegistry(entries: TokenCatalogEntry[]): TokenCatalog {
  const byPath: Record<string, TokenCatalogEntry> = {};
  const bySlashPath: Record<string, TokenCatalogEntry> = {};
  const byVariableId: Record<string, TokenCatalogEntry> = {};
  for (const e of entries) {
    byPath[e.path] = e;
    bySlashPath[e.slashPath] = e;
  }
  return { entries, byPath, bySlashPath, byVariableId };
}

describe('resolveVariableRef', () => {
  it('raw token with aliasOf null → shows path + value', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'color.bg.primary', resolvedValue: '#5B6CFF', aliasOf: null }),
    ]);
    const result = resolveVariableRef('color.bg.primary', registry);
    assert.equal(result.tokenLabel, 'color.bg.primary');
    assert.equal(result.bracketLabel, '#5B6CFF');
    assert.equal(result.debug.isAlias, false);
    assert.equal(result.debug.hadFallback, false);
  });

  it('alias without target resolution → shows alias path + target', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'semantic.primary', aliasOf: 'primitives.blue.500', resolvedValue: '' }),
    ]);
    const result = resolveVariableRef('semantic.primary', registry);
    assert.equal(result.tokenLabel, 'semantic.primary');
    assert.equal(result.bracketLabel, 'primitives.blue.500');
    assert.equal(result.debug.isAlias, true);
    assert.equal(result.debug.aliasTarget, 'primitives.blue.500');
    assert.equal(result.debug.resolvedValue, null);
  });

  it('alias with target in registry → shows alias + target = value', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'semantic.primary', aliasOf: 'primitives.blue.500', resolvedValue: '' }),
      makeEntry({ path: 'primitives.blue.500', resolvedValue: '#5B6CFF', aliasOf: null }),
    ]);
    const result = resolveVariableRef('semantic.primary', registry);
    assert.equal(result.tokenLabel, 'semantic.primary');
    assert.equal(result.bracketLabel, 'primitives.blue.500 = #5B6CFF');
    assert.equal(result.debug.isAlias, true);
    assert.equal(result.debug.resolvedValue, '#5B6CFF');
  });

  it('VariableID not found in registry → fallback to raw text', () => {
    const registry = makeRegistry([]);
    const result = resolveVariableRef('VariableID:1:20', registry);
    assert.equal(result.tokenLabel, 'VariableID:1:20');
    assert.equal(result.bracketLabel, null);
    assert.equal(result.debug.hadFallback, true);
  });

  it('VariableID found in byVariableId → resolves to token path + value', () => {
    const accent = makeEntry({ path: 'color.bg.primary', resolvedValue: '#5B6CFF', aliasOf: null });
    const registry = makeRegistry([accent]);
    registry.byVariableId['VariableID:1:20'] = accent;

    const result = resolveVariableRef('VariableID:1:20', registry);
    assert.equal(result.tokenLabel, 'color.bg.primary');
    assert.equal(result.bracketLabel, '#5B6CFF');
    assert.equal(result.debug.hadFallback, false);
  });

  it('mixed string with VariableID + css var resolves via extracted VariableID', () => {
    const accent = makeEntry({ path: 'color.background.accent', resolvedValue: '#5B6CFF', aliasOf: null });
    const registry = makeRegistry([accent]);
    registry.byVariableId['VariableID:1:12'] = accent;

    const result = resolveVariableRef('VariableID:1:12 var(--color-accent-bg)""', registry);
    assert.equal(result.tokenLabel, 'color.background.accent');
    assert.equal(result.bracketLabel, '#5B6CFF');
    assert.equal(result.debug.hadFallback, false);
  });

  it('mixed string without VariableID mapping resolves via css var fallback', () => {
    const accent = makeEntry({
      path: 'color.background.accent',
      cssVar: '--color-accent-bg',
      resolvedValue: '#5B6CFF',
      aliasOf: null,
    });
    const registry = makeRegistry([accent]);

    const result = resolveVariableRef('VariableID:1:12 var(--color-accent-bg)""', registry);
    assert.equal(result.tokenLabel, 'color.background.accent');
    assert.equal(result.bracketLabel, '#5B6CFF');
    assert.equal(result.debug.hadFallback, false);
  });

  it('empty input → empty label without error', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'color.bg.primary', resolvedValue: '#5B6CFF' }),
    ]);
    const result = resolveVariableRef('', registry);
    assert.equal(result.tokenLabel, '');
    assert.equal(result.bracketLabel, null);
  });

  it('alias whose target is not in registry → shows target path without = value', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'semantic.primary', aliasOf: 'missing.target', resolvedValue: '' }),
    ]);
    const result = resolveVariableRef('semantic.primary', registry);
    assert.equal(result.tokenLabel, 'semantic.primary');
    assert.equal(result.bracketLabel, 'missing.target');
    assert.equal(result.debug.isAlias, true);
    assert.equal(result.debug.resolvedValue, null);
  });

  it('slash-format path lookup works via bySlashPath', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'color.bg.primary', slashPath: 'color/bg/primary', resolvedValue: '#5B6CFF', aliasOf: null }),
    ]);
    const result = resolveVariableRef('color/bg/primary', registry);
    assert.equal(result.tokenLabel, 'color.bg.primary');
    assert.equal(result.bracketLabel, '#5B6CFF');
  });

  it('non-string input is handled defensively with fallback', () => {
    const registry = makeRegistry([]);
    const result = resolveVariableRef(42 as unknown, registry);
    assert.equal(result.tokenLabel, '42');
    assert.equal(result.bracketLabel, null);
    assert.equal(result.debug.hadFallback, true);
  });

  it('case-insensitive: "Primitives/Blue/300" resolves to "primitives/blue/300" entry', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'primitives.blue.300', slashPath: 'primitives/blue/300', resolvedValue: '#5B6CFF', aliasOf: null }),
    ]);
    const result = resolveVariableRef('Primitives/Blue/300', registry);
    assert.equal(result.tokenLabel, 'primitives.blue.300');
    assert.equal(result.bracketLabel, '#5B6CFF');
    assert.equal(result.debug.hadFallback, false);
  });

  it('bracketed input: "[color token]" strips brackets before lookup', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'color.token', slashPath: 'color/token', resolvedValue: '#FF0000', aliasOf: null }),
    ]);
    const result = resolveVariableRef('[color token]', registry);
    // "color token" has no dots/slashes so won't match any path → fallback
    assert.equal(result.debug.hadFallback, true);

    // But "[color/token]" should resolve after stripping brackets
    const result2 = resolveVariableRef('[color/token]', registry);
    assert.equal(result2.tokenLabel, 'color.token');
    assert.equal(result2.bracketLabel, '#FF0000');
    assert.equal(result2.debug.hadFallback, false);
  });

  it('dot-slash interchange: dot input resolves slash-indexed entry', () => {
    const registry = makeRegistry([
      makeEntry({ path: 'color.bg.accent', slashPath: 'color/bg/accent', resolvedValue: '#123456', aliasOf: null }),
    ]);
    // Input uses dots, should still resolve even if direct byPath match works
    const result = resolveVariableRef('color.bg.accent', registry);
    assert.equal(result.tokenLabel, 'color.bg.accent');
    assert.equal(result.bracketLabel, '#123456');

    // Input uses slashes
    const result2 = resolveVariableRef('color/bg/accent', registry);
    assert.equal(result2.tokenLabel, 'color.bg.accent');
    assert.equal(result2.bracketLabel, '#123456');
  });
});

describe('formatVariableRef', () => {
  it('with bracketLabel → formatted string', () => {
    assert.equal(
      formatVariableRef({
        tokenLabel: 'color.bg.primary',
        bracketLabel: '#5B6CFF',
        debug: { inputText: 'color.bg.primary', isAlias: false, aliasTarget: null, resolvedValue: '#5B6CFF', hadFallback: false },
      }),
      'color.bg.primary [#5B6CFF]',
    );
  });

  it('null bracketLabel → tokenLabel only', () => {
    assert.equal(
      formatVariableRef({
        tokenLabel: 'VariableID:1:20',
        bracketLabel: null,
        debug: { inputText: 'VariableID:1:20', isAlias: false, aliasTarget: null, resolvedValue: null, hadFallback: true },
      }),
      'VariableID:1:20',
    );
  });

  it('alias with resolved target → full format', () => {
    assert.equal(
      formatVariableRef({
        tokenLabel: 'semantic.primary',
        bracketLabel: 'primitives.blue.500 = #5B6CFF',
        debug: { inputText: 'semantic.primary', isAlias: true, aliasTarget: 'primitives.blue.500', resolvedValue: '#5B6CFF', hadFallback: false },
      }),
      'semantic.primary [primitives.blue.500 = #5B6CFF]',
    );
  });
});

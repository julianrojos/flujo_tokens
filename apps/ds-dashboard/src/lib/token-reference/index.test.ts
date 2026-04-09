import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveVariableRef, formatVariableRef } from './index.js';
import type { TokenRegistry, TokenEntry } from '@/types/token-registry';

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
  for (const e of entries) {
    byPath[e.path] = e;
    bySlashPath[e.slashPath] = e;
  }
  return { entries, byPath, bySlashPath };
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

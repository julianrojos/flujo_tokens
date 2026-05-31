/**
 * Token Usage Index Service
 *
 * Generates a deterministic usage index for token registry entries
 * from CSS references and alias chains.
 *
 * Pure logic module - I/O handled by runner.
 */

import * as fs from 'node:fs';

import type {
  TokenCatalog,
  TokenUsageIndex,
  TokenUsageEntryNew,
  TokenUsageKindExtended,
} from './token-types.js';
import {
  buildTokenCssVarLookup,
  extractCssVarReferences,
} from './token-utils.js';

export interface CssSource {
  file: string;
  content: string;
}

/**
 * Reference found in CSS file
 */
export interface CssReference {
  varName: string;
  file: string;
  value: string;
}

/**
 * Extract token references from CSS files
 */
export function extractCssReferences(
  cssFiles: string[],
  registry: TokenCatalog,
): CssReference[] {
  const cssSources = cssFiles
    .filter((cssFile) => fs.existsSync(cssFile))
    .map((cssFile) => ({
      file: cssFile,
      content: fs.readFileSync(cssFile, 'utf8'),
    }));

  return extractCssReferencesFromSources(cssSources, registry);
}

/**
 * Extract token references from CSS sources already loaded in memory.
 */
export function extractCssReferencesFromSources(
  cssSources: CssSource[],
  registry: TokenCatalog,
): CssReference[] {
  const refs: CssReference[] = [];
  const tokenLookup = buildTokenCssVarLookup(registry);

  for (const source of cssSources) {
    const lines = String(source.content || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const varRefs = extractCssVarReferences(line);

      for (const varName of varRefs) {
        const token = tokenLookup.get(varName);
        if (token) {
          refs.push({
            varName,
            file: source.file,
            value: line.trim(),
          });
        }
      }
    }
  }

  return refs;
}

/**
 * Build alias chains from CSS files
 */
export function buildAliasChains(
  cssFiles: string[],
  registry: TokenCatalog,
): Map<string, string[]> {
  const cssSources = cssFiles
    .filter((cssFile) => fs.existsSync(cssFile))
    .map((cssFile) => ({
      file: cssFile,
      content: fs.readFileSync(cssFile, 'utf8'),
    }));

  return buildAliasChainsFromSources(cssSources);
}

/**
 * Build alias chains from CSS sources already loaded in memory.
 */
export function buildAliasChainsFromSources(
  cssSources: CssSource[],
): Map<string, string[]> {
  const chains = new Map<string, string[]>();

  for (const source of cssSources) {
    const lines = String(source.content || '').split('\n');

    for (const line of lines) {
      // Match: --var-name: var(--other-var);
      const match = line.match(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i);
      if (match) {
        const [, targetVar, sourceVar] = match;
        const existing = chains.get(targetVar) || [];
        if (!existing.includes(sourceVar)) {
          existing.push(sourceVar);
          chains.set(targetVar, existing);
        }
      }
    }
  }

  return chains;
}

/**
 * Generate token usage index
 *
 * Pure function - all I/O is passed as parameters
 */
export function generateUsageIndex(
  registry: TokenCatalog,
  cssRefs: CssReference[],
  aliasChains: Map<string, string[]>,
): TokenUsageIndex {
  const tokenLookup = buildTokenCssVarLookup(registry);
  const usageMap = new Map<string, TokenUsageEntryNew>();
  const warnings: Array<{ message: string; tokenPath?: string }> = [];
  const unresolvedRefs: Array<{
    ref: string;
    file: string;
    kind: TokenUsageKindExtended;
  }> = [];

  // Initialize usage entries for all tokens
  for (const entry of registry.entries) {
    const slashPath = entry.path.replace(/\./g, '/');
    const cssVar = entry.cssVar || `--${entry.path.replace(/\./g, '-')}`;

    if (!entry.cssVar) {
      warnings.push({ message: `Missing cssVar for token ${entry.path}, generated: ${cssVar}`, tokenPath: entry.path });
    }

    usageMap.set(entry.path, {
      path: entry.path,
      slashPath,
      cssVar,
      type: entry.type,
      collection: entry.collection,
      usageCount: 0,
      usageByKind: {},
      usedIn: [],
    });
  }

  // Process CSS references
  for (const ref of cssRefs) {
    const token = tokenLookup.get(ref.varName);
    if (token) {
      const usage = usageMap.get(token.path);
      if (usage) {
        usage.usageCount++;
        usage.usageByKind['css-alias'] = (usage.usageByKind['css-alias'] || 0) + 1;
        usage.usedIn.push({
          kind: 'css-alias',
          source: 'css-alias',
          owner: ref.file,
          detail: ref.varName,
        });
      }
    } else {
      // Unresolved CSS variable reference
      unresolvedRefs.push({
        ref: ref.varName,
        file: ref.file,
        kind: 'css-alias',
      });
    }
  }

  // Process alias chains
  for (const [targetVar, sourceVars] of Array.from(aliasChains.entries())) {
    const targetToken = tokenLookup.get(targetVar);
    if (targetToken) {
      const usage = usageMap.get(targetToken.path);
      if (usage) {
        // Add alias chain references
        for (const sourceVar of sourceVars) {
          usage.usageCount++;
          usage.usageByKind['css-alias'] = (usage.usageByKind['css-alias'] || 0) + 1;
          usage.usedIn.push({
            kind: 'css-alias',
            source: 'alias-chain',
            owner: sourceVar,
            detail: `alias to ${targetVar}`,
          });
        }
      }
    }
  }

  // Build final structure
  const entries = Array.from(usageMap.values()).filter(u => u.usageCount > 0);
  const byPath = Object.fromEntries(entries.map(e => [e.path, e]));
  const bySlashPath = Object.fromEntries(entries.map(e => [e.slashPath, e]));
  const byCssVar = Object.fromEntries(entries.map(e => [e.cssVar, e]));
  const usage_links_total = entries.reduce((sum, e) => sum + e.usageCount, 0);

  return {
    summary: {
      generatedAt: new Date().toISOString(),
      totalTokens: registry.entries.length,
      tokensWithUsage: entries.length,
      usage_links_total,
    },
    warnings,
    unresolved: unresolvedRefs,
    entries,
    byPath,
    bySlashPath,
    byCssVar,
  };
}

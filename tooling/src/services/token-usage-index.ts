/**
 * Token Usage Index Service
 *
 * Generates a deterministic usage index for token registry entries
 * from component specs and CSS alias chains.
 *
 * Pure logic module - I/O handled by runner.
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

import type {
  TokenRegistry,
  TokenRegistryEntry,
  TokenUsage,
  TokenUsageIndexReport,
  TokenUsageIndex,
  TokenUsageEntryNew,
  TokenUsageOccurrenceNew,
  TokenUsageKindExtended,
} from './token-types.js';
import {
  CSS_VAR_REF_RE,
  extractCssVarReferences,
  findTokenByCssVar,
  findTokenByPath,
} from './token-utils.js';

/**
 * Check if value is a TBD marker
 */
function isTbdMarker(value: string): boolean {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed === 'tbd' || trimmed === '' || trimmed === 'null' || trimmed === 'undefined';
}

/**
 * Reference found in spec YAML
 */
interface SpecReference {
  tokenId: string;
  tokenPath: string;
  file: string;
  property?: string;
}

/**
 * Reference found in CSS file
 */
interface CssReference {
  varName: string;
  file: string;
  value: string;
}

/**
 * Extract token references from spec YAML files
 */
export function extractSpecReferences(
  specRoot: string,
  registry: TokenRegistry,
): SpecReference[] {
  const refs: SpecReference[] = [];

  if (!fs.existsSync(specRoot)) {
    return refs;
  }

  const specFiles = fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.yml'))
    .map((f) => f.name);

  for (const file of specFiles) {
    const filePath = `${specRoot}/${file}`;
    const content = fs.readFileSync(filePath, 'utf8');

    try {
      const spec = yaml.load(content) as Record<string, unknown>;

      // Extract token_mapping references
      const tokenMapping = spec.token_mapping as Record<string, string> | undefined;
      if (tokenMapping) {
        for (const [property, tokenPath] of Object.entries(tokenMapping)) {
          if (typeof tokenPath === 'string' && !isTbdMarker(tokenPath)) {
            const token = findTokenByPath(registry, tokenPath);
            if (token) {
              refs.push({
                tokenId: token.id,
                tokenPath,
                file: filePath,
                property,
              });
            }
          }
        }
      }

      // Extract var() references in other fields
      const contentStr = JSON.stringify(spec);
      const varRefs = extractCssVarReferences(contentStr);
      for (const varName of varRefs) {
        const token = findTokenByCssVar(registry, varName);
        if (token) {
          refs.push({
            tokenId: token.id,
            tokenPath: token.path,
            file: filePath,
            property: 'inline',
          });
        }
      }
    } catch {
      // Skip invalid YAML files
    }
  }

  return refs;
}

/**
 * Extract token references from CSS files
 */
export function extractCssReferences(
  cssFiles: string[],
  registry: TokenRegistry,
): CssReference[] {
  const refs: CssReference[] = [];

  for (const cssFile of cssFiles) {
    if (!fs.existsSync(cssFile)) {
      continue;
    }

    const content = fs.readFileSync(cssFile, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const varRefs = extractCssVarReferences(line);

      for (const varName of varRefs) {
        const token = findTokenByCssVar(registry, varName);
        if (token) {
          refs.push({
            varName,
            file: cssFile,
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
  registry: TokenRegistry,
): Map<string, string[]> {
  const chains = new Map<string, string[]>();

  for (const cssFile of cssFiles) {
    if (!fs.existsSync(cssFile)) {
      continue;
    }

    const content = fs.readFileSync(cssFile, 'utf8');
    const lines = content.split('\n');

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
 * Inject figma aliases into usage map
 */
export function injectFigmaAliases(
  usageMap: Map<string, TokenUsageEntryNew>,
  figmaAliasGraphPath: string,
  warnings: Array<{ message: string; tokenPath?: string }>,
): void {
  if (!fs.existsSync(figmaAliasGraphPath)) {
    return;
  }

  try {
    const graph = JSON.parse(fs.readFileSync(figmaAliasGraphPath, 'utf8'));
    if (!graph.aliases || !Array.isArray(graph.aliases)) {
      return;
    }

    for (const alias of graph.aliases) {
      // alias.toPath is the token being pointed to (the one that shows up in "Used in")
      const entry = usageMap.get(alias.toPath);
      if (!entry) continue;

      entry.usedIn.push({
        kind: 'figma-alias',
        source: 'figma-variables',
        owner: alias.fromPath,
        detail: alias.modes ? alias.modes.join(', ') : 'unknown',
      });
      entry.usageCount++;
      entry.usageByKind['figma-alias'] = (entry.usageByKind['figma-alias'] || 0) + 1;
    }
  } catch (error) {
    // Add warning to array so user sees it in output JSON (not just console)
    warnings.push({
      message: `Failed to process figma-alias-graph.json: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Generate token usage index
 *
 * Pure function - all I/O is passed as parameters
 */
export function generateUsageIndex(
  registry: TokenRegistry,
  specRefs: SpecReference[],
  cssRefs: CssReference[],
  aliasChains: Map<string, string[]>,
  figmaAliasGraphPath?: string,
): TokenUsageIndex {
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

  // Process spec references
  for (const ref of specRefs) {
    const usage = usageMap.get(ref.tokenPath);
    if (usage) {
      usage.usageCount++;
      usage.usageByKind['component-spec'] = (usage.usageByKind['component-spec'] || 0) + 1;
      usage.usedIn.push({
        kind: 'component-spec',
        source: 'component-spec',
        owner: ref.file,
        detail: ref.property || 'unknown',
      });
    }
  }

  // Process CSS references
  for (const ref of cssRefs) {
    const token = findTokenByCssVar(registry, ref.varName);
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
    const targetToken = findTokenByCssVar(registry, targetVar);
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

  // Inject figma aliases if graph path provided
  if (figmaAliasGraphPath) {
    injectFigmaAliases(usageMap, figmaAliasGraphPath, warnings);
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

/**
 * Main function to generate usage index
 *
 * Handles file I/O
 */
export function generateUsageIndexFromFile(
  registryPath: string,
  specRoot: string,
  cssFiles: string[],
  figmaAliasGraphPath?: string,
): TokenUsageIndex {
  // Load registry
  const registryContent = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(registryContent) as TokenRegistry;

  // Extract references
  const specRefs = extractSpecReferences(specRoot, registry);
  const cssRefs = extractCssReferences(cssFiles, registry);
  const aliasChains = buildAliasChains(cssFiles, registry);

  // Generate index
  return generateUsageIndex(registry, specRefs, cssRefs, aliasChains, figmaAliasGraphPath);
}

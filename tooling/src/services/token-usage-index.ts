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
 * Generate token usage index
 *
 * Pure function - all I/O is passed as parameters
 */
export function generateUsageIndex(
  registry: TokenRegistry,
  specRefs: SpecReference[],
  cssRefs: CssReference[],
  aliasChains: Map<string, string[]>,
): TokenUsageIndexReport {
  const usageMap = new Map<string, TokenUsage>();
  const unresolvedRefs: Array<{
    ref: string;
    file: string;
    context: 'spec' | 'css' | 'other';
  }> = [];

  // Initialize usage entries for all tokens
  for (const entry of registry.entries) {
    usageMap.set(entry.id, {
      tokenId: entry.id,
      tokenPath: entry.path,
      usageCount: 0,
      usedIn: [],
      unresolvedRefs: [],
    });
  }

  // Process spec references
  for (const ref of specRefs) {
    const usage = usageMap.get(ref.tokenId);
    if (usage) {
      usage.usageCount++;
      usage.usedIn.push({
        file: ref.file,
        context: 'spec',
        property: ref.property,
      });
    }
  }

  // Process CSS references
  for (const ref of cssRefs) {
    const token = findTokenByCssVar(registry, ref.varName);
    if (token) {
      const usage = usageMap.get(token.id);
      if (usage) {
        usage.usageCount++;
        usage.usedIn.push({
          file: ref.file,
          context: 'css',
        });
      }
    } else {
      // Unresolved CSS variable reference
      unresolvedRefs.push({
        ref: ref.varName,
        file: ref.file,
        context: 'css',
      });
    }
  }

  // Process alias chains
  for (const [targetVar, sourceVars] of Array.from(aliasChains.entries())) {
    const targetToken = findTokenByCssVar(registry, targetVar);
    if (targetToken) {
      const usage = usageMap.get(targetToken.id);
      if (usage) {
        // Add alias chain references
        for (const sourceVar of sourceVars) {
          usage.usageCount++;
          usage.usedIn.push({
            file: 'alias-chain',
            context: 'css',
          });
        }
      }
    }
  }

  // Calculate summary
  const tokensWithUsage = Array.from(usageMap.values()).filter(
    (u) => u.usageCount > 0,
  );

  const totalReferences = Array.from(usageMap.values()).reduce(
    (sum, u) => sum + u.usageCount,
    0,
  );

  const specReferences = specRefs.length;
  const cssReferences = cssRefs.length;

  return {
    timestamp: new Date().toISOString(),
    totalTokens: registry.entries.length,
    tokensWithUsage: tokensWithUsage.length,
    usage: Array.from(usageMap.values()).sort((a, b) =>
      a.tokenPath.localeCompare(b.tokenPath),
    ),
    unresolved: unresolvedRefs,
    summary: {
      totalReferences,
      specReferences,
      cssReferences,
      unresolvedCount: unresolvedRefs.length,
    },
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
): TokenUsageIndexReport {
  // Load registry
  const registryContent = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(registryContent) as TokenRegistry;

  // Extract references
  const specRefs = extractSpecReferences(specRoot, registry);
  const cssRefs = extractCssReferences(cssFiles, registry);
  const aliasChains = buildAliasChains(cssFiles, registry);

  // Generate index
  return generateUsageIndex(registry, specRefs, cssRefs, aliasChains);
}

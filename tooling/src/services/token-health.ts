/**
 * Token Health Service
 *
 * Builds an operational health summary for token registry entries
 * including usage, coupling, broken aliases, broken refs, and WCAG pairs.
 *
 * Pure logic module - I/O handled by runner.
 */

import type {
  TokenRegistry,
  TokenHealthReport,
  TokenHealthIssue,
  WcagPair,
} from './token-types.js';
import {
  findTokenByPath,
  isPrimitiveValue,
} from './token-utils.js';

/**
 * Check for broken aliases in token registry
 */
export function findBrokenAliases(registry: TokenRegistry): TokenHealthIssue[] {
  const issues: TokenHealthIssue[] = [];

  for (const entry of registry.entries) {
    if (entry.aliases) {
      for (const aliasId of entry.aliases) {
        const targetToken = registry.entries.find((e) => e.id === aliasId);
        if (!targetToken) {
          issues.push({
            code: 'BROKEN_ALIAS',
            severity: 'error',
            tokenId: entry.id,
            tokenPath: entry.path,
            message: `References non-existent alias: ${aliasId}`,
            suggestedFix: `Remove alias reference or create token with ID: ${aliasId}`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for broken CSS variable references
 * Extracts ALL var(--name) references from the value, not just pure var() values.
 */
export function findBrokenRefs(
  registry: TokenRegistry,
  cssVarIndex: Map<string, string>,
): TokenHealthIssue[] {
  const issues: TokenHealthIssue[] = [];

  // Regex to match ALL var(--name) references in the value
  // Captures: var(--name) or var(--name, fallback)
  const VAR_REF_REGEX = /var\(\s*(--[a-z0-9-]+)(?:\s*,\s*[^)]+)?\)/gi;

  for (const entry of registry.entries) {
    const value = entry.$value.trim();

    // Find all var() references in the value
    const matches = value.matchAll(VAR_REF_REGEX);
    for (const match of matches) {
      const varName = match[1];
      const targetTokenId = cssVarIndex.get(varName);

      if (!targetTokenId) {
        issues.push({
          code: 'BROKEN_REF',
          severity: 'error',
          tokenId: entry.id,
          tokenPath: entry.path,
          message: `References non-existent CSS variable: ${varName}`,
          suggestedFix: `Create token with CSS variable ${varName} or fix reference`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check WCAG contrast pairs
 *
 * Note: WCAG contrast calculation is not fully implemented.
 * This function currently returns empty failures array.
 * To enable WCAG checking, implement color parsing and contrast ratio calculation
 * per WCAG 2.1 guidelines (luminance formula).
 */
export function checkWcagPairs(
  registry: TokenRegistry,
  wcagPairs: WcagPair[],
): Array<{
  fgToken: string;
  bgToken: string;
  contrastRatio: number;
  requiredLevel: 'AA' | 'AAA';
  actualLevel: 'AA' | 'AAA' | 'fail';
}> {
  const failures: Array<{
    fgToken: string;
    bgToken: string;
    contrastRatio: number;
    requiredLevel: 'AA' | 'AAA';
    actualLevel: 'AA' | 'AAA' | 'fail';
  }> = [];

  // WCAG contrast calculation not implemented yet.
  // Returns empty array - no failures reported until implementation is complete.
  // TODO: Implement color parsing and contrast ratio calculation per WCAG 2.1
  // See: https://www.w3.org/WAI/GL/wiki/Relative_luminance
  // See: https://www.w3.org/WAI/GL/wiki/Contrast_ratio

  return failures;
}

/**
 * Find high coupling tokens by usage count
 * Supports both new format (entries) and legacy format (usage) for backward compatibility
 */
export function findHighUsageTokens(
  usageIndex: any,
  threshold: number,
): Array<{
  tokenId: string;
  tokenPath: string;
  usageCount: number;
}> {
  const highUsage: Array<{
    tokenId: string;
    tokenPath: string;
    usageCount: number;
  }> = [];

  // New format: usageIndex.entries (preferred)
  if (usageIndex && usageIndex.entries && Array.isArray(usageIndex.entries)) {
    for (const entry of usageIndex.entries) {
      if (entry.usageCount >= threshold) {
        highUsage.push({
          tokenId: entry.path, // Use path as tokenId in new format
          tokenPath: entry.path,
          usageCount: entry.usageCount,
        });
      }
    }
  }
  // Legacy format: usageIndex.usage (fallback for backward compatibility)
  else if (usageIndex && usageIndex.usage && Array.isArray(usageIndex.usage)) {
    for (const usage of usageIndex.usage) {
      if (usage.usageCount >= threshold) {
        highUsage.push({
          tokenId: usage.tokenId,
          tokenPath: usage.tokenPath,
          usageCount: usage.usageCount,
        });
      }
    }
  }

  return highUsage.sort((a, b) => b.usageCount - a.usageCount);
}

/**
 * Find high coupling tokens by graph in-degree
 */
export function findHighIndegreeTokens(
  graph: any,
  threshold: number,
): Array<{
  tokenId: string;
  tokenPath: string;
  inDegree: number;
}> {
  const highIndegree: Array<{
    tokenId: string;
    tokenPath: string;
    inDegree: number;
  }> = [];

  if (graph && graph.nodes) {
    for (const node of graph.nodes) {
      if (node.inDegree >= threshold) {
        highIndegree.push({
          tokenId: node.id,
          tokenPath: node.path,
          inDegree: node.inDegree,
        });
      }
    }
  }

  return highIndegree.sort((a, b) => b.inDegree - a.inDegree);
}

/**
 * Generate token health report
 */
export function generateHealthReport(
  registry: TokenRegistry,
  usageIndex: any,
  graph: any,
  wcagPairs: WcagPair[],
  options: {
    maxItems: number;
    highUsageThreshold: number;
    highIndegreeThreshold: number;
  },
): TokenHealthReport {
  const issues: TokenHealthIssue[] = [];

  // Find broken aliases
  const brokenAliases = findBrokenAliases(registry);
  issues.push(...brokenAliases);

  // Build CSS var index
  const cssVarIndex = new Map<string, string>();
  for (const entry of registry.entries) {
    if (entry.cssVar) {
      cssVarIndex.set(entry.cssVar, entry.id);
    }
  }

  // Find broken refs
  const brokenRefs = findBrokenRefs(registry, cssVarIndex);
  issues.push(...brokenRefs);

  // Check WCAG pairs
  const wcagFailures = checkWcagPairs(registry, wcagPairs);

  // Find high coupling tokens
  const highUsageTokens = findHighUsageTokens(usageIndex, options.highUsageThreshold);
  const highIndegreeTokens = findHighIndegreeTokens(graph, options.highIndegreeThreshold);

  // Calculate summary
  const errorIssues = issues.filter((i) => i.severity === 'error');
  const warningIssues = issues.filter((i) => i.severity === 'warning');

  const healthyTokens =
    registry.entries.length -
    new Set(issues.map((i) => i.tokenId)).size;

  const status: TokenHealthReport['status'] =
    errorIssues.length > 0
      ? 'error'
      : warningIssues.length > 0
        ? 'warning'
        : 'healthy';

  return {
    timestamp: new Date().toISOString(),
    status,
    summary: {
      totalTokens: registry.entries.length,
      healthyTokens,
      warningTokens: warningIssues.length,
      errorTokens: errorIssues.length,
      brokenAliases: brokenAliases.length,
      brokenRefs: brokenRefs.length,
      wcagFailures: wcagFailures.length,
      highCouplingTokens: highUsageTokens.length + highIndegreeTokens.length,
    },
    issues: issues.slice(0, options.maxItems),
    highUsageTokens: highUsageTokens.slice(0, options.maxItems),
    highIndegreeTokens: highIndegreeTokens.slice(0, options.maxItems),
    wcagFailures,
  };
}

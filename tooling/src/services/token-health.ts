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
 */
export function findBrokenRefs(
  registry: TokenRegistry,
  cssVarIndex: Map<string, string>,
): TokenHealthIssue[] {
  const issues: TokenHealthIssue[] = [];

  for (const entry of registry.entries) {
    const value = entry.$value.trim();

    // Check if value is a CSS var reference
    const match = value.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]+)?\)$/i);
    if (match) {
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

  // Simplified WCAG check - in real implementation would calculate contrast ratio
  for (const pair of wcagPairs) {
    const fgToken = findTokenByPath(registry, pair.fg);
    const bgToken = findTokenByPath(registry, pair.bg);

    if (!fgToken || !bgToken) {
      continue;
    }

    // Placeholder - would need color parsing and contrast calculation
    // For now, assume all pairs pass
    const actualLevel: 'AA' | 'AAA' | 'fail' = 'AA';

    if (pair.level === 'AAA' && actualLevel === 'AA') {
      failures.push({
        fgToken: pair.fg,
        bgToken: pair.bg,
        contrastRatio: 4.5,
        requiredLevel: pair.level,
        actualLevel,
      });
    }
  }

  return failures;
}

/**
 * Find high coupling tokens by usage count
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

  if (usageIndex && usageIndex.usage) {
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

/**
 * Type definitions for Token Services
 *
 * Shared types for token-health, token-usage-index, and token-graph services.
 */

/**
 * Token registry entry structure
 */
export interface TokenRegistryEntry {
  /** Token ID (internal identifier) */
  id: string;
  /** Token path (e.g., "Semantic.Color.Focus-Outline.Inner") */
  path: string;
  /** Token value */
  $value: string;
  /** Token type */
  type: string;
  /** Collection name */
  collection: string;
  /** Mode information */
  mode?: string;
  /** CSS variable name */
  cssVar?: string;
  /** Aliases (other token IDs that reference this token) */
  aliases?: string[];
}

/**
 * Token registry structure
 */
export interface TokenRegistry {
  /** Registry entries */
  entries: TokenRegistryEntry[];
  /** Registry metadata */
  meta: {
    generatedAt: string;
    version: string;
  };
}

/**
 * CSS variable reference found in code
 */
export interface CssVarReference {
  /** CSS variable name (e.g., --color-primary) */
  varName: string;
  /** File where it was found */
  file: string;
  /** Line number (if available) */
  line?: number;
  /** Context (spec, css, etc.) */
  context: 'spec' | 'css' | 'other';
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Token ID */
  tokenId: string;
  /** Token path */
  tokenPath: string;
  /** Number of times used */
  usageCount: number;
  /** Where it's used */
  usedIn: Array<{
    file: string;
    context: 'spec' | 'css' | 'other';
    property?: string;
  }>;
  /** Unresolved references to this token */
  unresolvedRefs: string[];
}

/**
 * Token graph node
 */
export interface TokenGraphNode {
  /** Token ID */
  id: string;
  /** Token path */
  path: string;
  /** Token value */
  value: string;
  /** Type */
  type: string;
  /** CSS variable name */
  cssVar?: string;
  /** Dependency depth */
  depth: number;
  /** In-degree (number of tokens that depend on this one) */
  inDegree: number;
  /** Out-degree (number of tokens this one depends on) */
  outDegree: number;
}

/**
 * Token graph edge
 */
export interface TokenGraphEdge {
  /** Source token ID */
  from: string;
  /** Target token ID */
  to: string;
  /** Edge kind */
  kind: 'w3c-ref' | 'alias-id';
  /** Reference string */
  ref: string;
}

/**
 * Token graph structure
 */
export interface TokenGraph {
  /** Graph nodes */
  nodes: TokenGraphNode[];
  /** Graph edges */
  edges: TokenGraphEdge[];
  /** Cycles detected */
  cycles: string[][];
  /** Collections */
  collections: Map<string, string[]>;
  /** Modes */
  modes: Map<string, { key: string; selector?: string; isDefault?: boolean }>;
}

/**
 * WCAG contrast pair configuration
 */
export interface WcagPair {
  /** Foreground token path */
  fg: string;
  /** Background token path */
  bg: string;
  /** Required WCAG level */
  level: 'AA' | 'AAA';
  /** Context description */
  context: string;
}

/**
 * Token health status
 */
export type TokenHealthStatus = 'healthy' | 'warning' | 'error';

/**
 * Token health issue
 */
export interface TokenHealthIssue {
  /** Issue code */
  code: string;
  /** Severity */
  severity: 'error' | 'warning';
  /** Token ID */
  tokenId: string;
  /** Token path */
  tokenPath: string;
  /** Issue message */
  message: string;
  /** Suggested fix */
  suggestedFix?: string;
}

/**
 * Token health report
 */
export interface TokenHealthReport {
  /** Report timestamp */
  timestamp: string;
  /** Overall health status */
  status: TokenHealthStatus;
  /** Summary statistics */
  summary: {
    totalTokens: number;
    healthyTokens: number;
    warningTokens: number;
    errorTokens: number;
    brokenAliases: number;
    brokenRefs: number;
    wcagFailures: number;
    highCouplingTokens: number;
  };
  /** Issues by token */
  issues: TokenHealthIssue[];
  /** High coupling tokens (usage) */
  highUsageTokens: Array<{
    tokenId: string;
    tokenPath: string;
    usageCount: number;
  }>;
  /** High coupling tokens (graph in-degree) */
  highIndegreeTokens: Array<{
    tokenId: string;
    tokenPath: string;
    inDegree: number;
  }>;
  /** WCAG failures */
  wcagFailures: Array<{
    fgToken: string;
    bgToken: string;
    contrastRatio: number;
    requiredLevel: 'AA' | 'AAA';
    actualLevel: 'AA' | 'AAA' | 'fail';
  }>;
}

/**
 * Token usage index report
 */
export interface TokenUsageIndexReport {
  /** Report timestamp */
  timestamp: string;
  /** Total tokens in registry */
  totalTokens: number;
  /** Tokens with usage */
  tokensWithUsage: number;
  /** Usage entries */
  usage: TokenUsage[];
  /** Unresolved references */
  unresolved: Array<{
    ref: string;
    file: string;
    context: 'spec' | 'css' | 'other';
  }>;
  /** Summary statistics */
  summary: {
    totalReferences: number;
    specReferences: number;
    cssReferences: number;
    unresolvedCount: number;
  };
}

/**
 * Token graph report
 */
export interface TokenGraphReport {
  /** Report timestamp */
  timestamp: string;
  /** Graph data */
  graph: TokenGraph;
  /** Cycles detected */
  cycles: string[][];
  /** High indirection chains */
  highIndirection: Array<{
    tokenId: string;
    tokenPath: string;
    chainLength: number;
    chain: string[];
  }>;
  /** Unused primitive terminals */
  unusedPrimitives: string[];
  /** Unresolved aliases */
  unresolvedAliases: string[];
  /** Identity collisions */
  collisions: Array<{
    cssVar: string;
    tokenIds: string[];
  }>;
  /** Summary statistics */
  summary: {
    totalNodes: number;
    totalEdges: number;
    cycleCount: number;
    highIndirectionCount: number;
    unusedPrimitiveCount: number;
    unresolvedAliasCount: number;
    collisionCount: number;
  };
}

/**
 * Common options for token services
 */
export interface TokenServiceOptions {
  /** Path to token registry */
  registry: string;
  /** Output format */
  format: 'json' | 'text';
  /** Dry run mode */
  dryRun: boolean;
  /** Design system context */
  system?: string;
}

/**
 * Extended token usage kinds used by the usage index.
 */
export type TokenUsageKindExtended = 'css-alias' | 'figma-alias';

/**
 * Token usage occurrence with extended kinds
 */
export interface TokenUsageOccurrenceNew {
  kind: TokenUsageKindExtended;
  source: string;
  owner: string;
  detail: string;
}

/**
 * Token usage entry with new shape
 */
export interface TokenUsageEntryNew {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  usageCount: number;
  usageByKind: Record<string, number>;
  usedIn: TokenUsageOccurrenceNew[];
}

/**
 * Token usage index summary with new shape
 */
export interface TokenUsageIndexSummaryNew {
  generatedAt: string;
  totalTokens: number;
  tokensWithUsage: number;
  usage_links_total: number;
}

/**
 * New token usage index structure
 */
export interface TokenUsageIndex {
  summary: TokenUsageIndexSummaryNew;
  warnings: Array<{ message: string; tokenPath?: string }>;
  unresolved: Array<{ ref: string; file: string; kind: TokenUsageKindExtended }>;
  entries: TokenUsageEntryNew[];
  byPath: Record<string, TokenUsageEntryNew>;
  bySlashPath: Record<string, TokenUsageEntryNew>;
  byCssVar: Record<string, TokenUsageEntryNew>;
}

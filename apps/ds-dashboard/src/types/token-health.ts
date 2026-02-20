export interface TokenHealthWarning {
  id: string;
  message: string;
}

export interface TokenHealthSection<TItem> {
  items: TItem[];
  total: number;
  truncated: boolean;
}

export interface TokenHealthUnusedTokenRow {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  resolvedValue: string;
  usageCount: number;
}

export interface TokenHealthHighCouplingTokenRow {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  usageCount: number;
  inDegree: number;
  outDegree: number;
  isCycleMember: boolean;
  reasons: string[];
  usedByComponents: string[];
}

export interface TokenHealthBrokenAliasRow {
  token: string;
  aliasCssVar: string;
  aliasTarget: string | null;
  reason: string;
}

export interface TokenHealthBrokenCssVarRefRow {
  from: string;
  cssVar: string;
  reason: string;
}

export interface TokenHealthWcagFailureRow {
  foreground: string;
  background: string;
  level: "AA" | "AAA";
  textSize: "normal" | "large";
  contrastRatio: number;
  requiredRatio: number;
  foregroundHex: string;
  backgroundHex: string;
}

export interface TokenHealthReport {
  ok: boolean;
  schema_version: number;
  generated_at: string;
  source: {
    registry_path: string;
    usage_index_path: string;
    graph_viz_path: string;
    wcag_pairs_path: string;
  };
  thresholds: {
    high_usage_threshold: number;
    high_indegree_threshold: number;
  };
  summary: {
    tokens_total: number;
    tokens_with_usage: number;
    unused_tokens_total: number;
    high_coupling_tokens_total: number;
    broken_aliases_total: number;
    broken_css_var_refs_total: number;
    cycle_nodes_total: number;
    wcag_pairs_configured_total: number;
    wcag_pairs_resolved_total: number;
    wcag_failures_total: number;
  };
  warnings: TokenHealthWarning[];
  unused_tokens: TokenHealthSection<TokenHealthUnusedTokenRow>;
  high_coupling_tokens: TokenHealthSection<TokenHealthHighCouplingTokenRow>;
  broken_aliases: TokenHealthSection<TokenHealthBrokenAliasRow>;
  broken_css_var_refs: TokenHealthSection<TokenHealthBrokenCssVarRefRow>;
  wcag_failures: TokenHealthSection<TokenHealthWcagFailureRow>;
  upstream_fingerprints: {
    token_usage_index: string;
    token_graph_viz: string;
  };
  fingerprint_sha256: string;
  hint?: string;
}


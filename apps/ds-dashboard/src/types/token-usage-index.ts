export type TokenUsageKind = "component-spec" | "css-alias";

export interface TokenUsageOccurrence {
  kind: TokenUsageKind;
  source: string;
  owner: string;
  detail: string;
}

export interface TokenUsageEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  usageCount: number;
  usageByKind: Record<string, number>;
  usedIn: TokenUsageOccurrence[];
}

export interface TokenUsageIndexSummary {
  tokens_total: number;
  tokens_with_usage: number;
  tokens_without_usage: number;
  usage_links_total: number;
  usage_links_by_kind: Record<string, number>;
  unresolved_total: number;
}

export interface TokenUsageIndex {
  ok: boolean;
  summary: TokenUsageIndexSummary;
  entries: TokenUsageEntry[];
  byPath: Record<string, TokenUsageEntry>;
  bySlashPath: Record<string, TokenUsageEntry>;
  byCssVar: Record<string, TokenUsageEntry>;
}

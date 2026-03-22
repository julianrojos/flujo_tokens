export interface TokenDiffSource {
  type: "file" | "git-ref";
  label: string;
}

export interface TokenDiffSummary {
  before_tokens: number;
  current_tokens: number;
  added: number;
  removed: number;
  modified: number;
  breaking_changes: number;
  non_breaking_changes: number;
  ignored_entries?: {
    before: number;
    current: number;
  };
}

export interface TokenDiffAddedChange {
  identity: string;
  key: string;
  change_class: "non-breaking";
  token: {
    path: string;
    slashPath: string;
    cssVar: string;
    type: string;
    collection: string;
    resolvedValue: string;
  };
}

export interface TokenDiffRemovedChange {
  identity: string;
  key: string;
  change_class: "breaking";
  token: {
    path: string;
    slashPath: string;
    cssVar: string;
    type: string;
    collection: string;
    resolvedValue: string;
  };
}

export interface TokenDiffModifiedChange {
  identity: string;
  key: string;
  change_class: "breaking" | "non-breaking";
  fields_changed: string[];
  before: Record<string, string>;
  current: Record<string, string>;
  value_diff: { before: string; current: string } | null;
}

export interface TokenDiffReport {
  ok: boolean;
  sources: {
    current: TokenDiffSource;
    before: TokenDiffSource;
  };
  summary: TokenDiffSummary;
  changes: {
    added: TokenDiffAddedChange[];
    removed: TokenDiffRemovedChange[];
    modified: TokenDiffModifiedChange[];
  };
  fingerprint: string;
  hint?: string;
}


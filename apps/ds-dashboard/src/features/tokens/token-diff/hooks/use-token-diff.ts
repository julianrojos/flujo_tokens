/**
 * useTokenDiff hook - encapsulates fetch + graph processing + derived rows.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { fetchTokenDiff, fetchTokenGraph, fetchTokenUsageIndex } from "@/lib/api";
import type { TokenDiffReport } from "@/types/token-diff";
import type { TokenGraphViz } from "@/types/token-graph";
import type { TokenUsageIndex, TokenUsageEntry, TokenUsageUnresolvedRef } from "@/types/token-usage-index";
import { toApiErrorDisplay, type ApiErrorDisplay } from "@/lib/api-error-ux";
import type { SortDirection } from "@/lib/use-sort-state";
import {
  parseTokenPathFromIdentity,
  buildUnresolvedImpact,
  buildGraphImpact,
  type ChangeKind,
} from "../lib/token-diff-transforms";

export type SortField = "token" | "status" | "uses" | "dependents" | "notes";
export type { SortDirection };

export interface DiffTableRow {
  kind: ChangeKind;
  key: string;
  identity: string;
  change_class: "breaking" | "non-breaking";
  tokenPath: string;
  tokenCssVar?: string;
  fieldsChanged?: string[];
}

interface UseTokenDiffOptions {
  initialRef: string;
  search: string;
  showOnlyBreaking: boolean;
}

interface DiffStats {
  total: number;
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

export interface UseTokenDiffResult {
  // State
  loading: boolean;
  error: ApiErrorDisplay | null;

  // Data
  report: TokenDiffReport | null;
  usageIndex: TokenUsageIndex | null;
  graph: TokenGraphViz | null;

  // Derived
  stats: DiffStats | null;
  graphDependentsMap: Map<string, number>;
  usageByPath: Record<string, TokenUsageEntry>;
  unresolved: TokenUsageUnresolvedRef[];

  // Filtered rows
  addedRows: DiffTableRow[];
  removedRows: DiffTableRow[];
  modifiedRows: DiffTableRow[];

  // Actions
  load: (ref: string) => Promise<void>;

  // Selected row helpers (for impact panel)
  selectedUsageEntry: (selected: DiffTableRow | null) => TokenUsageEntry | null;
  selectedUnresolvedHits: (selected: DiffTableRow | null) => Array<{
    kind: string;
    source: string;
    owner: string;
    keyPath: string;
    tokenPath: string;
    reason: string;
    suggested?: string | null;
  }>;
  selectedGraphImpact: (selected: DiffTableRow | null) => { dependents: string[]; dependencies: string[] };
}

export function useTokenDiff({ initialRef, search, showOnlyBreaking }: UseTokenDiffOptions): UseTokenDiffResult {
  const [report, setReport] = useState<TokenDiffReport | null>(null);
  const [usageIndex, setUsageIndex] = useState<TokenUsageIndex | null>(null);
  const [graph, setGraph] = useState<TokenGraphViz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

  const load = useCallback(async (ref: string) => {
    setLoading(true);
    setError(null);
    try {
      const [diffPayload, usagePayload, graphPayload] = await Promise.all([
        fetchTokenDiff(ref),
        fetchTokenUsageIndex().catch(() => null),
        fetchTokenGraph().catch(() => null),
      ]);
      setReport(diffPayload);
      setUsageIndex(usagePayload);
      setGraph(graphPayload);
    } catch (cause) {
      setReport(null);
      setUsageIndex(null);
      setGraph(null);
      setError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Token diff failed",
          fallbackMessage: "Unable to compute token diff for the selected reference.",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initialRef);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentional: load once on mount

  // Performance fix: pre-compute graphDependentsMap once
  const graphDependentsMap = useMemo(() => {
    if (!graph) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const edge of graph.edges ?? []) {
      const targetPath = String(edge.target ?? "").replace(/^path:/, "");
      map.set(targetPath, (map.get(targetPath) ?? 0) + 1);
    }
    return map;
  }, [graph]);

  const stats = useMemo<DiffStats | null>(() => {
    if (!report) return null;
    const total = report.summary.added + report.summary.removed + report.summary.modified;
    return {
      total,
      added: report.summary.added,
      removed: report.summary.removed,
      modified: report.summary.modified,
      breaking: report.summary.breaking_changes,
    };
  }, [report]);

  const usageByPath = usageIndex?.byPath ?? {};
  const unresolved = usageIndex?.unresolved ?? [];

  const filtered = useMemo(() => {
    if (!report) {
      return { added: [], removed: [], modified: [] } as const;
    }

    const lowered = search.trim().toLowerCase();
    const matchesSearch = (value: string) => !lowered || value.toLowerCase().includes(lowered);
    const keepBreaking = (changeClass: string) => !showOnlyBreaking || changeClass === "breaking";

    const added = report.changes.added.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    const removed = report.changes.removed.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    const modified = report.changes.modified.filter((item) => {
      if (!keepBreaking(item.change_class)) return false;
      if (!matchesSearch(item.key)) return false;
      return true;
    });

    return { added, removed, modified } as const;
  }, [report, search, showOnlyBreaking]);

  const addedRows: DiffTableRow[] = useMemo(() => filtered.added.map((item) => ({
    kind: "added",
    key: item.key,
    identity: item.identity,
    change_class: item.change_class,
    tokenPath: item.token.path,
    tokenCssVar: item.token.cssVar,
  })), [filtered.added]);

  const removedRows: DiffTableRow[] = useMemo(() => filtered.removed.map((item) => ({
    kind: "removed",
    key: item.key,
    identity: item.identity,
    change_class: item.change_class,
    tokenPath: item.token.path,
    tokenCssVar: item.token.cssVar,
  })), [filtered.removed]);

  const modifiedRows: DiffTableRow[] = useMemo(() => filtered.modified.map((item) => ({
    kind: "modified",
    key: item.key,
    identity: item.identity,
    change_class: item.change_class,
    tokenPath: parseTokenPathFromIdentity(item.identity) ?? item.key,
    fieldsChanged: item.fields_changed,
  })), [filtered.modified]);

  const selectedUsageEntry = useCallback((selected: DiffTableRow | null): TokenUsageEntry | null => {
    if (!selected) return null;
    return usageByPath[selected.tokenPath] ?? null;
  }, [usageByPath]);

  const selectedUnresolvedHits = useCallback((selected: DiffTableRow | null) => {
    if (!selected) return [];
    return buildUnresolvedImpact(unresolved, selected.tokenPath, selected.tokenCssVar);
  }, [unresolved]);

  const selectedGraphImpact = useCallback((selected: DiffTableRow | null) => {
    if (!selected || !graph) return { dependents: [], dependencies: [] };
    return buildGraphImpact(graph, selected.tokenPath);
  }, [graph]);

  return {
    loading,
    error,
    report,
    usageIndex,
    graph,
    stats,
    graphDependentsMap,
    usageByPath,
    unresolved,
    addedRows,
    removedRows,
    modifiedRows,
    load,
    selectedUsageEntry,
    selectedUnresolvedHits,
    selectedGraphImpact,
  };
}

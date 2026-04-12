/**
 * Hook for token-detail page - encapsulates state, derived data, and handlers.
 */

import { useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTokenDetailData } from "../use-token-detail-data";
import type { TokenEntry, TokenRegistry } from "@/types/token-registry";
import type { ComponentRegistryItem } from "@/types/component-registry";
import type { TokenUsageOccurrence } from "@/types/token-usage-index";
import {
  resolveColorSwatch,
  extractLineNumber,
  resolveAliasTarget,
  parseDimensionPreview,
  buildAliasChain,
  tokenMatchesRef,
} from "../lib/token-detail-transforms";

export interface ComponentTokenUsage {
  slug: string;
  displayName: string;
  figmaUrl: string | null;
  figmaNodeId: string | null;
  mode: "direct" | "via_alias" | "both";
  occurrences: number;
  directOccurrences: number;
  viaAliasOccurrences: number;
  slots: string[];
  conditions: string[];
  aliasChains: string[][];
}

interface TokenDetailViewModel {
  // State
  copiedField: string | null;
  fromCollection: string;
  fromType: string;
  fromSearch: string;
  componentMode: string;
  componentQuery: string;

  // Derived data
  loading: boolean;
  error: string | null;
  registry: TokenRegistry | null;
  token: TokenEntry | null;
  swatch: string | null;
  dimensionPreview: { amount: number; unit: string; width: number } | null;
  tokenAliasChain: TokenEntry[];
  aliasBrokenRef: string | null;
  aliasHasCycle: boolean;
  aliasFinal: TokenEntry | null;
  scopedTokens: TokenEntry[];
  currentTokenIndex: number;
  previousToken: TokenEntry | null;
  nextToken: TokenEntry | null;
  reverseAliasMap: Map<string, TokenEntry[]>;
  aliasDescendantChains: Map<string, TokenEntry[]>;
  filteredComponentUsages: ComponentTokenUsage[];
  componentUsageSummary: { total: number; direct: number; viaAlias: number; occurrences: number };
  occurrencesByKind: Map<string, TokenUsageOccurrence[]>;
  healthIssues: Array<{ key: string; severity: "error" | "warning"; label: string; detail: string }>;

  // Handlers
  handleCopyValue: (key: string, value: string) => Promise<void>;
  setComponentFilter: (key: "cmode" | "cq", value: string) => void;
  handleNavigate: (token: TokenEntry) => void;
}

export function useTokenDetail(tokenPath?: string): TokenDetailViewModel {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const decoded = tokenPath ? decodeURIComponent(tokenPath) : "";

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const {
    loading,
    error,
    registry,
    token,
    usage,
    tokenHealth,
    components,
  } = useTokenDetailData(decoded);

  // Derived data
  const swatch = useMemo(
    () => (token ? resolveColorSwatch(token.resolvedValue) : null),
    [token],
  );

  const dimensionPreview = useMemo(
    () => (token?.type === "dimension" ? parseDimensionPreview(token.resolvedValue) : null),
    [token?.resolvedValue, token?.type],
  );

  const aliasChain = useMemo(() => buildAliasChain(registry, token), [registry, token]);
  const tokenAliasChain = aliasChain.chain;
  const aliasBrokenRef = aliasChain.brokenRef;
  const aliasHasCycle = aliasChain.hasCycle;
  const aliasFinal = tokenAliasChain.length > 0 ? tokenAliasChain[tokenAliasChain.length - 1] : null;

  // Filter params
  const fromCollection = searchParams.get("fromCollection") || "all";
  const fromType = searchParams.get("fromType") || "all";
  const fromSearch = String(searchParams.get("fromSearch") || "").trim().toLowerCase();
  const usageKindFilter = searchParams.get("uk") || "all";
  const usageOwnerFilter = searchParams.get("uo") || "all";
  const usageQuery = String(searchParams.get("uq") || "");
  const componentMode = searchParams.get("cmode") || "all";
  const componentQuery = String(searchParams.get("cq") || "").trim().toLowerCase();

  // Scoped tokens for navigation
  const scopedTokens = useMemo(() => {
    const entries = registry?.entries ?? [];
    const next = entries.filter((entry) => {
      const matchesCollection = fromCollection === "all" || entry.collection === fromCollection;
      const matchesType = fromType === "all" || entry.type === fromType;
      const matchesSearch =
        !fromSearch ||
        entry.path.toLowerCase().includes(fromSearch) ||
        entry.slashPath.toLowerCase().includes(fromSearch) ||
        entry.cssVar.toLowerCase().includes(fromSearch) ||
        entry.resolvedValue.toLowerCase().includes(fromSearch);
      return matchesCollection && matchesType && matchesSearch;
    });
    next.sort((left, right) => left.path.localeCompare(right.path));
    return next;
  }, [fromCollection, fromSearch, fromType, registry?.entries]);

  const currentTokenIndex = useMemo(() => {
    if (!token) return -1;
    return scopedTokens.findIndex((entry) => entry.path === token.path);
  }, [scopedTokens, token]);

  const previousToken = currentTokenIndex > 0 ? scopedTokens[currentTokenIndex - 1] : null;
  const nextToken =
    currentTokenIndex >= 0 && currentTokenIndex < scopedTokens.length - 1
      ? scopedTokens[currentTokenIndex + 1]
      : null;

  // Component lookup
  const componentBySlug = useMemo(() => {
    const map: Record<string, ComponentRegistryItem> = {};
    for (const component of components) {
      map[component.slug] = component;
    }
    return map;
  }, [components]);

  // Reverse alias map
  const reverseAliasMap = useMemo(() => {
    const map = new Map<string, TokenEntry[]>();
    if (!registry) return map;
    for (const entry of registry.entries ?? []) {
      if (!entry.aliasOf) continue;
      const target = resolveAliasTarget(registry, entry.aliasOf);
      if (!target) continue;
      const list = map.get(target.path) ?? [];
      list.push(entry);
      map.set(target.path, list);
    }
    return map;
  }, [registry]);

  // Descendant chains
  const aliasDescendantChains = useMemo(() => {
    const chains = new Map<string, TokenEntry[]>();
    if (!token) return chains;
    const queue: Array<{ entry: TokenEntry; chain: TokenEntry[] }> = [{ entry: token, chain: [token] }];
    const visited = new Set<string>([token.path]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const children = reverseAliasMap.get(current.entry.path) ?? [];
      for (const child of children) {
        if (visited.has(child.path)) continue;
        const chain = [child, ...current.chain];
        chains.set(child.path, chain);
        visited.add(child.path);
        queue.push({ entry: child, chain });
      }
    }
    return chains;
  }, [reverseAliasMap, token]);

  // Component usages
  const componentUsages = useMemo<ComponentTokenUsage[]>(() => {
    if (!token || !usage?.usedIn?.length) return [] as ComponentTokenUsage[];

    const rows = new Map<
      string,
      {
        slug: string;
        displayName: string;
        figmaUrl: string | null;
        figmaNodeId: string | null;
        occurrences: number;
        directOccurrences: number;
        viaAliasOccurrences: number;
        hasDirect: boolean;
        hasViaAlias: boolean;
        slotSet: Set<string>;
        conditionSet: Set<string>;
        aliasChainMap: Map<string, string[]>;
      }
    >();

    const ensureRow = (owner: string) => {
      const trimmed = String(owner || "").trim();
      if (!trimmed) return null;
      const component = componentBySlug[trimmed];
      const existing = rows.get(trimmed);
      if (existing) return existing;
      const created = {
        slug: trimmed,
        displayName: component?.display_name ?? trimmed,
        figmaUrl: component?.figma?.file_url ?? null,
        figmaNodeId: component?.figma?.component_set_node_id ?? null,
        occurrences: 0,
        directOccurrences: 0,
        viaAliasOccurrences: 0,
        hasDirect: false,
        hasViaAlias: false,
        slotSet: new Set<string>(),
        conditionSet: new Set<string>(),
        aliasChainMap: new Map<string, string[]>(),
      };
      rows.set(trimmed, created);
      return created;
    };

    const registerOccurrence = (occ: TokenUsageOccurrence) => {
      if (occ.kind !== "figma-applied" && occ.kind !== "figma-consumer-applied") return;
      const row = ensureRow(occ.owner);
      if (!row) return;

      const countMatch = String(occ.detail || "").match(/\bnodes:(\d+)\b/i);
      const nodeCount = countMatch ? Number.parseInt(countMatch[1], 10) : 0;
      row.occurrences += Number.isFinite(nodeCount) && nodeCount > 0 ? nodeCount : 1;

      const modeMatch = String(occ.detail || "").match(/\bmode:(direct|via_alias)(?:\s|$|·)/i);
      const mode = (modeMatch?.[1] || "direct").toLowerCase() === "via_alias" ? "via_alias" : "direct";
      if (mode === "direct") {
        row.hasDirect = true;
        row.directOccurrences += Number.isFinite(nodeCount) && nodeCount > 0 ? nodeCount : 1;
        return;
      }
      row.hasViaAlias = true;
      row.viaAliasOccurrences += Number.isFinite(nodeCount) && nodeCount > 0 ? nodeCount : 1;

      const aliasMatch = String(occ.detail || "").match(/\balias:([^\s·]+)/i);
      const aliasPath = String(aliasMatch?.[1] || "").trim();
      if (!aliasPath) return;
      const aliasChain = aliasDescendantChains.get(aliasPath) ?? null;
      if (!aliasChain || aliasChain.length === 0) return;
      const signature = aliasChain.map((entry) => entry.path).join(" -> ");
      if (!row.aliasChainMap.has(signature)) {
        row.aliasChainMap.set(signature, aliasChain.map((entry) => entry.path));
      }
    };

    for (const occ of usage.usedIn ?? []) {
      registerOccurrence(occ);
    }

    return Array.from(rows.values())
      .map((row): ComponentTokenUsage => {
        const mode: ComponentTokenUsage["mode"] = row.hasDirect && row.hasViaAlias
          ? "both"
          : row.hasViaAlias
            ? "via_alias"
            : "direct";
        return {
        slug: row.slug,
        displayName: row.displayName,
        figmaUrl: row.figmaUrl,
        figmaNodeId: row.figmaNodeId,
        mode,
        occurrences: row.occurrences,
        directOccurrences: row.directOccurrences,
        viaAliasOccurrences: row.viaAliasOccurrences,
        slots: Array.from(row.slotSet).sort((a, b) => a.localeCompare(b)),
        conditions: Array.from(row.conditionSet).sort((a, b) => a.localeCompare(b)),
        aliasChains: Array.from(row.aliasChainMap.values()),
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [aliasDescendantChains, componentBySlug, token, usage]);

  const filteredComponentUsages = useMemo(() => {
    return componentUsages.filter((entry) => {
      const matchesMode =
        componentMode === "all" ||
        (componentMode === "direct" && (entry.mode === "direct" || entry.mode === "both")) ||
        (componentMode === "via_alias" && (entry.mode === "via_alias" || entry.mode === "both"));
      if (!matchesMode) return false;
      if (!componentQuery) return true;
      const searchable = [
        entry.displayName,
        entry.slug,
        ...entry.slots,
        ...entry.conditions,
        ...entry.aliasChains.map((chain) => chain.join(" ")),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(componentQuery);
    });
  }, [componentMode, componentQuery, componentUsages]);

  const componentUsageSummary = useMemo(() => {
    const direct = componentUsages.filter((entry) => entry.mode === "direct" || entry.mode === "both").length;
    const viaAlias = componentUsages.filter((entry) => entry.mode === "via_alias" || entry.mode === "both").length;
    return {
      total: componentUsages.length,
      direct,
      viaAlias,
      occurrences: componentUsages.reduce((sum, entry) => sum + entry.occurrences, 0),
    };
  }, [componentUsages]);

  // Occurrences by kind
  const occurrencesByKind = useMemo(() => {
    if (!usage?.usedIn?.length) return new Map<string, TokenUsageOccurrence[]>();
    const map = new Map<string, TokenUsageOccurrence[]>();
    const loweredQuery = usageQuery.trim().toLowerCase();
    for (const occ of usage.usedIn) {
      const matchesKind = usageKindFilter === "all" || occ.kind === usageKindFilter;
      const matchesOwner = usageOwnerFilter === "all" || occ.owner === usageOwnerFilter;
      const searchValue = `${occ.owner} ${occ.source} ${occ.detail}`.toLowerCase();
      const matchesQuery = !loweredQuery || searchValue.includes(loweredQuery);
      if (!matchesKind || !matchesOwner || !matchesQuery) continue;
      const list = map.get(occ.kind) ?? [];
      list.push(occ);
      map.set(occ.kind, list);
    }
    const order = ["figma-applied", "figma-consumer-applied", "figma-alias"];
    const sorted = new Map<string, TokenUsageOccurrence[]>();
    for (const key of order) {
      if (map.has(key)) sorted.set(key, map.get(key)!);
    }
    for (const [key, value] of map) {
      if (!sorted.has(key)) sorted.set(key, value);
    }
    return sorted;
  }, [usage, usageKindFilter, usageOwnerFilter, usageQuery]);

  // Health issues
  const healthIssues = useMemo(() => {
    if (!token || !tokenHealth) return [];
    const issues: Array<{ key: string; severity: "error" | "warning"; label: string; detail: string }> = [];
    if (tokenHealth.unused_tokens.items.some((item) => item.path === token.path)) {
      issues.push({
        key: "unused",
        severity: "warning",
        label: "Unused token",
        detail: "No references found in the usage index.",
      });
    }
    if (tokenHealth.high_coupling_tokens.items.some((item) => item.path === token.path)) {
      issues.push({
        key: "high-coupling",
        severity: "warning",
        label: "High coupling",
        detail: "Token has many downstream references and change risk is elevated.",
      });
    }
    if (
      tokenHealth.broken_aliases.items.some(
        (item) => tokenMatchesRef(token, item.token) || tokenMatchesRef(token, item.aliasCssVar),
      )
    ) {
      issues.push({
        key: "broken-alias",
        severity: "error",
        label: "Broken alias",
        detail: "Alias reference cannot be resolved to an existing token.",
      });
    }
    if (
      tokenHealth.broken_css_var_refs.items.some(
        (item) => tokenMatchesRef(token, item.from) || tokenMatchesRef(token, item.cssVar),
      )
    ) {
      issues.push({
        key: "broken-css-ref",
        severity: "error",
        label: "Broken CSS var reference",
        detail: "Resolved value references an unknown CSS variable.",
      });
    }
    if (
      tokenHealth.wcag_failures.items.some(
        (item) => tokenMatchesRef(token, item.foreground) || tokenMatchesRef(token, item.background),
      )
    ) {
      issues.push({
        key: "wcag",
        severity: "error",
        label: "WCAG contrast failure",
        detail: "Token participates in at least one failing contrast pair.",
      });
    }
    return issues;
  }, [token, tokenHealth]);

  // Handlers
  const setComponentFilter = useCallback((key: "cmode" | "cq", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleCopyValue = useCallback(async (key: string, value: string) => {
    const content = String(value || "").trim();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedField(key);
      window.setTimeout(() => {
        setCopiedField((current) => (current === key ? null : current));
      }, 1500);
    } catch {
      setCopiedField(null);
    }
  }, []);

  const handleNavigate = useCallback((token: TokenEntry) => {
    navigate({
      pathname: `/tokens/${encodeURIComponent(token.path)}`,
    });
  }, [navigate]);

  return {
    // State
    copiedField,
    fromCollection,
    fromType,
    fromSearch,
    componentMode,
    componentQuery,

    // Derived data
    loading,
    error,
    registry,
    token,
    swatch,
    dimensionPreview,
    tokenAliasChain,
    aliasBrokenRef,
    aliasHasCycle,
    aliasFinal,
    scopedTokens,
    currentTokenIndex,
    previousToken,
    nextToken,
    reverseAliasMap,
    aliasDescendantChains,
    filteredComponentUsages,
    componentUsageSummary,
    occurrencesByKind,
    healthIssues,

    // Handlers
    handleCopyValue,
    setComponentFilter,
    handleNavigate,
  };
}

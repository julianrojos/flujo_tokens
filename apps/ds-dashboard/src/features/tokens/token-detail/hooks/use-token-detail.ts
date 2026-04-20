/**
 * Hook for token-detail page - encapsulates state, derived data, and handlers.
 */

import { useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTokenDetailData } from "../use-token-detail-data";
import type { TokenCatalogEntry, TokenCatalog } from "@/types/token-catalog";
import {
  resolveColorSwatch,
  resolveAliasTarget,
  parseDimensionPreview,
  buildAliasChain,
  deriveTokenDisplayType,
} from "../lib/token-detail-transforms";
import {
  buildComponentTokenUsageRows,
  type ComponentTokenUsage,
} from "../lib/token-detail-usage-derivation";

interface TokenDetailViewModel {
  fromCollection: string;
  fromType: string;
  fromSearch: string;
  componentMode: string;
  componentQuery: string;

  // Derived data
  loading: boolean;
  error: string | null;
  registry: TokenCatalog | null;
  token: TokenCatalogEntry | null;
  swatch: string | null;
  dimensionPreview: { amount: number; unit: string; width: number } | null;
  displayType: string;
  tokenAliasChain: TokenCatalogEntry[];
  aliasBrokenRef: string | null;
  aliasHasCycle: boolean;
  aliasFinal: TokenCatalogEntry | null;
  scopedTokens: TokenCatalogEntry[];
  currentTokenIndex: number;
  previousToken: TokenCatalogEntry | null;
  nextToken: TokenCatalogEntry | null;
  reverseAliasMap: Map<string, TokenCatalogEntry[]>;
  aliasDescendantChains: Map<string, TokenCatalogEntry[]>;
  filteredComponentUsages: ComponentTokenUsage[];
  componentUsageSummary: { total: number; direct: number; viaAlias: number; occurrences: number };

  // Handlers
  setComponentFilter: (key: "cmode" | "cq", value: string) => void;
  handleNavigate: (token: TokenCatalogEntry) => void;
}

export function useTokenDetail(tokenPath?: string): TokenDetailViewModel {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const decoded = tokenPath ? decodeURIComponent(tokenPath) : "";

  const {
    loading,
    error,
    registry,
    token,
    components,
  } = useTokenDetailData(decoded);

  // Derived data
  const aliasChain = useMemo(() => buildAliasChain(registry, token), [registry, token]);
  const tokenAliasChain = aliasChain.chain;
  const aliasBrokenRef = aliasChain.brokenRef;
  const aliasHasCycle = aliasChain.hasCycle;
  const aliasFinal = tokenAliasChain.length > 0 ? tokenAliasChain[tokenAliasChain.length - 1] : null;
  const resolvedVisualValue = aliasFinal?.resolvedValue || token?.resolvedValue || "";

  const swatch = useMemo(
    () => resolveColorSwatch(resolvedVisualValue),
    [resolvedVisualValue],
  );

  const dimensionPreview = useMemo(
    () => parseDimensionPreview(resolvedVisualValue),
    [resolvedVisualValue],
  );

  const displayType = useMemo(
    () =>
      deriveTokenDisplayType({
        token,
        resolvedValue: resolvedVisualValue,
      }),
    [resolvedVisualValue, token],
  );

  // Filter params
  const fromCollection = searchParams.get("fromCollection") || "all";
  const fromType = searchParams.get("fromType") || "all";
  const fromSearch = String(searchParams.get("fromSearch") || "").trim().toLowerCase();
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

  // Reverse alias map
  const reverseAliasMap = useMemo(() => {
    const map = new Map<string, TokenCatalogEntry[]>();
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
    const chains = new Map<string, TokenCatalogEntry[]>();
    if (!token) return chains;
    const queue: Array<{ entry: TokenCatalogEntry; chain: TokenCatalogEntry[] }> = [{ entry: token, chain: [token] }];
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
  const componentUsages = useMemo<ComponentTokenUsage[]>(
    () =>
      buildComponentTokenUsageRows({
        tokenPath: decoded,
        registry,
        components,
      }),
    [components, decoded, registry],
  );

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

  // Handlers
  const setComponentFilter = useCallback((key: "cmode" | "cq", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleNavigate = useCallback((token: TokenCatalogEntry) => {
    navigate({
      pathname: `/tokens/${encodeURIComponent(token.path)}`,
    });
  }, [navigate]);

  return {
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
    displayType,
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

    // Handlers
    setComponentFilter,
    handleNavigate,
  };
}

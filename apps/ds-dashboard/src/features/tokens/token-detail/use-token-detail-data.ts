import {
  fetchComponentRegistry,
  fetchDesignSystemsConfig,
  fetchReportByVariable,
  fetchTokenHealth,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
  getActiveSystemId,
} from "@/lib/api";
import { resolveDesignSystemContext } from "@/lib/design-system-keys";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import type { ComponentRegistry } from "@/types/component-registry";
import type { VariableUsageReport } from "@/types/consumers";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenHealthReport } from "@/types/token-health";
import type { TokenUsageEntry, TokenUsageIndex, TokenUsageOccurrence } from "@/types/token-usage-index";
import { buildFigmaConsumerUsageOccurrences } from "./lib/token-detail-usage-derivation";

const EMPTY_BY_PATH: Record<string, TokenUsageEntry> = {};

type TokenDetailQueryData = {
  systemId: string;
  dsFileKey: string | null;
  registry: TokenRegistry;
  tokenHealth: TokenHealthReport | null;
  componentRegistry: ComponentRegistry | null;
};

export const tokenDetailQueryKey = (tokenPath: string, systemId: string) =>
  ["token-detail", systemId, tokenPath] as const;

export const variableReportsQueryKey = (dsFileKey: string) =>
  ["variable-reports", dsFileKey] as const;

export function useTokenDetailQuery(tokenPath: string) {
  const activeSystemId = getActiveSystemId() || "";
  return useQuery<TokenDetailQueryData>({
    queryKey: tokenDetailQueryKey(tokenPath, activeSystemId),
    enabled: Boolean(tokenPath),
    ...QUERY_DEFAULTS,
    queryFn: async () => {
      const config = await fetchDesignSystemsConfig().catch(() => null);
      const { systemId: resolvedSystemId, dsFileKey } = resolveDesignSystemContext(
        config,
        activeSystemId,
      );

      const [registry, tokenHealth, componentRegistry] =
        await Promise.all([
          fetchTokenRegistry(),
          fetchTokenHealth().catch(() => null),
          fetchComponentRegistry().catch(() => null),
        ]);

      return {
        systemId: resolvedSystemId,
        dsFileKey,
        registry,
        tokenHealth,
        componentRegistry,
      };
    },
  });
}

/**
 * Fetch variable reports for a DS file with caching.
 * Uses a shared query key to cache data across token detail page navigations.
 */
export function useVariableReportsQuery(dsFileKey: string | null) {
  return useQuery<VariableUsageReport[] | null>({
    queryKey: variableReportsQueryKey(dsFileKey ?? ""),
    enabled: Boolean(dsFileKey),
    ...QUERY_DEFAULTS,
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      if (!dsFileKey) return null;
      return fetchReportByVariable(dsFileKey)
        .then((payload) => payload.data ?? null)
        .catch(() => null);
    },
  });
}

export const tokenUsageIndexQueryKey = (systemId: string) => ["token-usage-index", systemId] as const;

/**
 * Fetch token usage index with per-system cache scoping.
 * Keeps usage data isolated when switching active design systems.
 */
export function useTokenUsageIndexQuery(systemId: string, enabled = true) {
  return useQuery<{ index: TokenUsageIndex | null; hasError: boolean }>({
    queryKey: tokenUsageIndexQueryKey(systemId),
    enabled,
    ...QUERY_DEFAULTS,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const index = await fetchTokenUsageIndex(systemId);
        return { index, hasError: false };
      } catch (error) {
        console.warn("[useTokenUsageIndexQuery] Failed to fetch token usage index", error);
        return { index: null, hasError: true };
      }
    },
  });
}


function buildMergedUsageEntry(args: {
  tokenPath: string;
  registry: TokenRegistry | null;
  consumerVariableReports: VariableUsageReport[] | null;
}): TokenUsageEntry | null {
  const token = args.registry?.byPath?.[args.tokenPath] ?? null;
  if (!token) return null;

  const consumerUsage = buildFigmaConsumerUsageOccurrences({
    tokenPath: args.tokenPath,
    registry: args.registry,
    consumerVariableReports: args.consumerVariableReports,
  });

  const usageByKind: Record<string, number> = {};
  const usedIn: TokenUsageOccurrence[] = [];
  let usageCount = 0;

  // Persisted consumer sync data (from ds_variable_usage table)
  if (consumerUsage.parentCount > 0) {
    usageCount += consumerUsage.parentCount;
    usedIn.push(...consumerUsage.parentOccurrences);
    usageByKind["figma-applied"] = consumerUsage.parentCount;
  }

  if (consumerUsage.consumerCount > 0) {
    usageCount += consumerUsage.consumerCount;
    usedIn.push(...consumerUsage.consumerOccurrences);
    usageByKind["figma-consumer-applied"] = consumerUsage.consumerCount;
  }

  if (usageCount <= 0) return null;

  return {
    path: token.path,
    slashPath: token.slashPath,
    cssVar: token.cssVar,
    type: token.type,
    collection: token.collection,
    usageCount,
    usageByKind,
    usedIn,
  };
}

export function useTokenDetailData(tokenPath: string) {
  const activeSystemId = getActiveSystemId() || "";
  const query = useTokenDetailQuery(tokenPath);
  const variableReportsQuery = useVariableReportsQuery(query.data?.dsFileKey ?? null);
  const effectiveSystemId = String(query.data?.systemId || activeSystemId || "").trim();
  const hasSystemContext = Boolean(effectiveSystemId);
  const usageIndexQuery = useTokenUsageIndexQuery(effectiveSystemId, hasSystemContext);
  const missingSystemContextError =
    !query.isLoading && !hasSystemContext
      ? "No design system context available. Configure or select an active design system."
      : null;

  const error = missingSystemContextError
    ? missingSystemContextError
    : query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : variableReportsQuery.error
      ? variableReportsQuery.error instanceof Error
        ? variableReportsQuery.error.message
        : String(variableReportsQuery.error)
      : null;
  const registry = query.data?.registry ?? null;
  const token = registry?.byPath[tokenPath] ?? null;

  // usageByPath is still exposed for compatibility, but token counts are derived from
  // Figma/consumer reports (figma-applied + figma-consumer-applied), not spec occurrences.
  const usageByPath = usageIndexQuery.data?.index?.byPath ?? EMPTY_BY_PATH;

  // Canonical usage for token detail: only DS + consumer occurrences from reports.
  const usage = useMemo((): TokenUsageEntry | null => {
    const figmaEntry = buildMergedUsageEntry({
      tokenPath,
      registry,
      consumerVariableReports: variableReportsQuery.data ?? null,
    });
    return figmaEntry;
  }, [tokenPath, registry, variableReportsQuery.data]);

  const tokenHealth = query.data?.tokenHealth ?? null;
  const components = query.data?.componentRegistry?.components ?? [];

  return {
    loading: query.isLoading || variableReportsQuery.isLoading || usageIndexQuery.isLoading,
    error,
    registry,
    token,
    usage,
    usageByPath,
    tokenHealth,
    components,
    usageIndexHasError: usageIndexQuery.data?.hasError ?? false,
  };
}

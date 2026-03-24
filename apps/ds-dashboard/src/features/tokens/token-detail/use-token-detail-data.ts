import {
  fetchComponentRegistry,
  fetchDesignSystemsConfig,
  fetchReportByVariable,
  fetchTokenGraphQuery,
  fetchTokenHealth,
  fetchTokenRegistry,
  getActiveSystemId,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import type { ComponentRegistry } from "@/types/component-registry";
import type { VariableUsageReport } from "@/types/consumers";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenGraphQueryResult } from "@/types/token-graph";
import type { TokenHealthReport } from "@/types/token-health";
import type { TokenUsageEntry, TokenUsageOccurrence } from "@/types/token-usage-index";
import {
  buildTokenUsageTargets,
  variableReportMatchesTokenTargets,
} from "./lib/token-detail-transforms";

type TokenDetailQueryData = {
  dsFileKey: string | null;
  registry: TokenRegistry;
  tokenHealth: TokenHealthReport | null;
  graphQuery: TokenGraphQueryResult | null;
  componentRegistry: ComponentRegistry | null;
};

const PARENT_CONSUMER_ID_PREFIX = "parent:" as const;

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
      const system = activeSystemId
        ? (config?.systems ?? []).find((item) => item.id === activeSystemId)
        : null;
      const dsFileKey = String(system?.figmaFileId ?? "").trim() || null;

      const [registry, tokenHealth, graphQuery, componentRegistry] =
        await Promise.all([
          fetchTokenRegistry(),
          fetchTokenHealth().catch(() => null),
          fetchTokenGraphQuery({
            tokenPath,
            direction: "both",
            depth: 4,
          }).catch(() => null),
          fetchComponentRegistry().catch(() => null),
        ]);

      return {
        dsFileKey,
        registry,
        tokenHealth,
        graphQuery,
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

function resolveTokenTargets(tokenPath: string, registry: TokenRegistry | null): Set<string> {
  const token = registry?.byPath?.[tokenPath] ?? null;
  return buildTokenUsageTargets(token);
}

function buildFigmaConsumerUsageOccurrences(args: {
  targets: Set<string>;
  consumerVariableReports: VariableUsageReport[] | null;
}): {
  parentCount: number;
  parentOccurrences: TokenUsageOccurrence[];
  consumerCount: number;
  consumerOccurrences: TokenUsageOccurrence[];
} {
  const reports = args.consumerVariableReports ?? [];

  const matched = reports.filter((report) =>
    variableReportMatchesTokenTargets(report, args.targets),
  );

  if (matched.length === 0) {
    return {
      parentCount: 0,
      parentOccurrences: [],
      consumerCount: 0,
      consumerOccurrences: [],
    };
  }

  return buildOccurrencesFromReports(matched);
}

function buildOccurrencesFromReports(reports: VariableUsageReport[]): {
  parentCount: number;
  parentOccurrences: TokenUsageOccurrence[];
  consumerCount: number;
  consumerOccurrences: TokenUsageOccurrence[];
} {
  const parentOccurrences: TokenUsageOccurrence[] = [];
  const consumerOccurrences: TokenUsageOccurrence[] = [];
  let parentCount = 0;
  let consumerCount = 0;

  for (const report of reports) {
    for (const consumer of report.consumers ?? []) {
      const nodeCount = Number.isFinite(consumer.nodeCount)
        ? Math.max(0, Number(consumer.nodeCount))
        : 0;
      const isParent = String(consumer.consumerId || "").startsWith(PARENT_CONSUMER_ID_PREFIX);
      if (isParent) {
        parentCount += nodeCount;
        parentOccurrences.push({
          kind: "figma-applied",
          source: "",
          owner: consumer.consumerName || "Parent file",
          detail: `${report.variableName} · ${consumer.consumerFileKey} · nodes:${nodeCount}`,
        });
      } else {
        consumerCount += nodeCount;
        consumerOccurrences.push({
          kind: "figma-consumer-applied",
          source: "",
          owner: consumer.consumerName || consumer.consumerFileKey || "consumer",
          detail: `${report.variableName} · ${consumer.consumerFileKey} · nodes:${nodeCount}`,
        });
      }
    }
  }

  return { parentCount, parentOccurrences, consumerCount, consumerOccurrences };
}

function buildMergedUsageEntry(args: {
  tokenPath: string;
  registry: TokenRegistry | null;
  consumerVariableReports: VariableUsageReport[] | null;
}): TokenUsageEntry | null {
  const token = args.registry?.byPath?.[args.tokenPath] ?? null;
  if (!token) return null;

  const targets = resolveTokenTargets(args.tokenPath, args.registry);
  const consumerUsage = buildFigmaConsumerUsageOccurrences({
    targets,
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
  const query = useTokenDetailQuery(tokenPath);
  const variableReportsQuery = useVariableReportsQuery(query.data?.dsFileKey ?? null);

  const error = query.error
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
  const mergedUsage = buildMergedUsageEntry({
    tokenPath,
    registry,
    consumerVariableReports: variableReportsQuery.data ?? null,
  });
  const usage = mergedUsage;
  const usageByPath = usage ? { [tokenPath]: usage } : {};
  const tokenHealth = query.data?.tokenHealth ?? null;
  const graphQuery = query.data?.graphQuery ?? null;
  const components = query.data?.componentRegistry?.components ?? [];

  return {
    loading: query.isLoading || variableReportsQuery.isLoading,
    error,
    registry,
    token,
    usage,
    usageByPath,
    tokenHealth,
    graphQuery,
    components,
  };
}

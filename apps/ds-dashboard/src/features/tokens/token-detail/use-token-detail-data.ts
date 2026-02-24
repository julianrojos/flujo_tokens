import {
  fetchComponentRegistry,
  fetchTokenGraphQuery,
  fetchTokenHealth,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import type { ComponentRegistry } from "@/types/component-registry";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenGraphQueryResult } from "@/types/token-graph";
import type { TokenHealthReport } from "@/types/token-health";
import type { TokenUsageIndex } from "@/types/token-usage-index";

type TokenDetailQueryData = {
  registry: TokenRegistry;
  usageIndex: TokenUsageIndex | null;
  tokenHealth: TokenHealthReport | null;
  graphQuery: TokenGraphQueryResult | null;
  componentRegistry: ComponentRegistry | null;
};

export const tokenDetailQueryKey = (tokenPath: string) =>
  ["token-detail", tokenPath] as const;

export function useTokenDetailQuery(tokenPath: string) {
  return useQuery<TokenDetailQueryData>({
    queryKey: tokenDetailQueryKey(tokenPath),
    enabled: Boolean(tokenPath),
    ...QUERY_DEFAULTS,
    queryFn: async () => {
      const [registry, usageIndex, tokenHealth, graphQuery, componentRegistry] =
        await Promise.all([
          fetchTokenRegistry(),
          fetchTokenUsageIndex().catch(() => null),
          fetchTokenHealth().catch(() => null),
          fetchTokenGraphQuery({
            tokenPath,
            direction: "both",
            depth: 4,
          }).catch(() => null),
          fetchComponentRegistry().catch(() => null),
        ]);
      return {
        registry,
        usageIndex,
        tokenHealth,
        graphQuery,
        componentRegistry,
      };
    },
  });
}

export function useTokenDetailData(tokenPath: string) {
  const query = useTokenDetailQuery(tokenPath);

  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null;
  const registry = query.data?.registry ?? null;
  const token = registry?.byPath[tokenPath] ?? null;
  const usage = query.data?.usageIndex?.byPath?.[tokenPath] ?? null;
  const usageByPath = query.data?.usageIndex?.byPath ?? {};
  const tokenHealth = query.data?.tokenHealth ?? null;
  const graphQuery = query.data?.graphQuery ?? null;
  const components = query.data?.componentRegistry?.components ?? [];

  return {
    loading: query.isLoading,
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

import {
  fetchComponentCatalog,
  fetchDesignSystemsConfig,
  fetchTokenHealth,
  fetchTokenCatalog,
  getActiveSystemId,
} from "@/lib/api";
import { resolveDesignSystemContext } from "@/lib/design-system-keys";
import { useQuery } from "@tanstack/react-query";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import type { ComponentCatalog } from "@/types/component-catalog";
import type { TokenCatalog } from "@/types/token-catalog";
import type { TokenHealthReport } from "@/types/token-health";

type TokenDetailQueryData = {
  systemId: string;
  registry: TokenCatalog;
  tokenHealth: TokenHealthReport | null;
  componentCatalog: ComponentCatalog | null;
};

export const tokenDetailQueryKey = (tokenPath: string, systemId: string) =>
  ["token-detail", systemId, tokenPath] as const;

export function useTokenDetailQuery(tokenPath: string) {
  const activeSystemId = getActiveSystemId() || "";
  return useQuery<TokenDetailQueryData>({
    queryKey: tokenDetailQueryKey(tokenPath, activeSystemId),
    enabled: Boolean(tokenPath),
    ...QUERY_DEFAULTS,
    queryFn: async () => {
      const config = await fetchDesignSystemsConfig().catch(() => null);
      const { systemId: resolvedSystemId } = resolveDesignSystemContext(
        config,
        activeSystemId,
      );

      const [registry, tokenHealth, componentCatalog] =
        await Promise.all([
          fetchTokenCatalog(),
          fetchTokenHealth().catch(() => null),
          fetchComponentCatalog().catch(() => null),
        ]);

      return {
        systemId: resolvedSystemId,
        registry,
        tokenHealth,
        componentCatalog,
      };
    },
  });
}

export function useTokenDetailData(tokenPath: string) {
  const activeSystemId = getActiveSystemId() || "";
  const query = useTokenDetailQuery(tokenPath);
  const effectiveSystemId = String(query.data?.systemId || activeSystemId || "").trim();
  const hasSystemContext = Boolean(effectiveSystemId);
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
    : null;
  const registry = query.data?.registry ?? null;
  const token = registry?.byPath[tokenPath] ?? null;

  const tokenHealth = query.data?.tokenHealth ?? null;
  const components = query.data?.componentCatalog?.components ?? [];

  return {
    loading: query.isLoading,
    error,
    registry,
    token,
    tokenHealth,
    components,
  };
}

import {
  fetchComponentCatalog,
  fetchDesignSystemsConfig,
  fetchTokenCatalog,
  getActiveSystemId,
} from "@/lib/api";
import { resolveDesignSystemContext } from "@/lib/design-system-keys";
import { queryClient, QUERY_DEFAULTS } from "@/lib/query-client";
import { useQuery } from "@tanstack/react-query";
import type { ComponentCatalog } from "@/types/component-catalog";
import type { TokenCatalog } from "@/types/token-catalog";

type TokenDetailQueryData = {
  systemId: string;
  registry: TokenCatalog;
  componentCatalog: ComponentCatalog | null;
};

async function fetchTokenDetailQueryData(activeSystemId: string): Promise<TokenDetailQueryData> {
  const config = await fetchDesignSystemsConfig().catch(() => null);
  const { systemId: resolvedSystemId } = resolveDesignSystemContext(
    config,
    activeSystemId,
  );

  const [registry, componentCatalog] = await Promise.all([
    fetchTokenCatalog(),
    fetchComponentCatalog().catch(() => null),
  ]);

  return {
    systemId: resolvedSystemId,
    registry,
    componentCatalog,
  };
}

export const tokenDetailQueryKey = (tokenPath: string, systemId: string) =>
  ["token-detail", systemId, tokenPath] as const;

export function useTokenDetailQuery(tokenPath: string) {
  const activeSystemId = getActiveSystemId() || "";
  return useQuery<TokenDetailQueryData>({
    queryKey: tokenDetailQueryKey(tokenPath, activeSystemId),
    enabled: Boolean(tokenPath),
    placeholderData: (previousData) =>
      previousData?.systemId === activeSystemId ? previousData : undefined,
    ...QUERY_DEFAULTS,
    queryFn: async () => fetchTokenDetailQueryData(activeSystemId),
  });
}

export function prefetchTokenDetailQuery(tokenPath: string): Promise<unknown> {
  const activeSystemId = getActiveSystemId() || "";
  if (!tokenPath) {
    return Promise.resolve();
  }

  return queryClient.prefetchQuery({
    queryKey: tokenDetailQueryKey(tokenPath, activeSystemId),
    ...QUERY_DEFAULTS,
    queryFn: async () => fetchTokenDetailQueryData(activeSystemId),
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

  const components = query.data?.componentCatalog?.components ?? [];

  return {
    loading: query.isLoading,
    error,
    registry,
    token,
    components,
  };
}

/**
 * Hook for fetching Figma descriptions for a component.
 *
 * S-11 (R-005): Uses TanStack React Query per MUST rule in
 * general-programming-principles.mdc §6.4 (escalated to MUST in ds-dashboard).
 */

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

interface FigmaDescriptionsData {
  componentSetDescription: string | null;
  variantDescriptions: Array<{ canonicalKey: string; description: string | null }>;
  syncedAt: number | null;
  stale: boolean;
}

interface DocsResponse {
  ok: true;
  markdown: string;
  source: 'fresh' | 'cache';
  syncedAt: number | null;
  stale: boolean;
  descriptions: {
    componentSet: string | null;
    variants: Array<{ canonicalKey: string; description: string | null }>;
  } | null;
}

const QUERY_KEY = 'figmaDescriptions';
const EMPTY_DESCRIPTIONS: FigmaDescriptionsData = {
  componentSetDescription: null,
  variantDescriptions: [],
  syncedAt: null,
  stale: true,
};

async function fetchFigmaDescriptions(slug: string): Promise<FigmaDescriptionsData> {
  const res = await fetch(`/api/components/${encodeURIComponent(slug)}/docs/markdown`);
  if (res.status === 404) {
    return EMPTY_DESCRIPTIONS;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data: DocsResponse = await res.json();
  return {
    componentSetDescription: data.descriptions?.componentSet ?? null,
    variantDescriptions: data.descriptions?.variants ?? [],
    syncedAt: data.syncedAt ?? null,
    stale: data.stale ?? true,
  };
}

export function useFigmaDescriptions(
  slug: string | undefined,
): UseQueryResult<FigmaDescriptionsData> {
  return useQuery({
    queryKey: [QUERY_KEY, slug],
    queryFn: () => {
      if (!slug) {
        throw new Error("slug is required");
      }
      return fetchFigmaDescriptions(slug);
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Invalidate and refetch Figma descriptions with ?refresh=true.
 * Returns the query function that forces a refresh.
 */
export function useRefreshFigmaDescriptions() {
  const queryClient = useQueryClient();

  return async (slug: string) => {
    const res = await fetch(
      `/api/components/${encodeURIComponent(slug)}/docs/markdown?refresh=true`,
    );
    if (res.status === 404) {
      queryClient.setQueryData([QUERY_KEY, slug], EMPTY_DESCRIPTIONS);
      return EMPTY_DESCRIPTIONS;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data: DocsResponse = await res.json();
    const result: FigmaDescriptionsData = {
      componentSetDescription: data.descriptions?.componentSet ?? null,
      variantDescriptions: data.descriptions?.variants ?? [],
      syncedAt: data.syncedAt ?? null,
      stale: data.stale ?? true,
    };
    // Update the query cache with fresh data
    queryClient.setQueryData([QUERY_KEY, slug], result);
    return result;
  };
}

/**
 * Hook for fetching Figma descriptions for a component.
 *
 * S-11 (R-005): Uses TanStack React Query per MUST rule in
 * general-programming-principles.mdc §6.4 (escalated to MUST in ds-dashboard).
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

interface FigmaDescriptionsData {
  componentSetDescription: string | null;
  variantDescriptions: Array<{ canonicalKey: string; description: string | null }>;
}

interface DocsResponse {
  ok: true;
  markdown: string;
  source: 'fresh' | 'cache';
  descriptions: {
    componentSet: string | null;
    variants: Array<{ canonicalKey: string; description: string | null }>;
  } | null;
}

const QUERY_KEY = 'figmaDescriptions';
const EMPTY_DESCRIPTIONS: FigmaDescriptionsData = {
  componentSetDescription: null,
  variantDescriptions: [],
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
    placeholderData: (previousData) => previousData,
    enabled: !!slug,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

import {
  fetchComponentCatalog,
  fetchDesignSystemsConfig,
  fetchHealthHistory,
  fetchReportByVariable,
  fetchTokenCatalog,
  fetchTokenUsageIndex,
} from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { resolveDesignSystemContext } from '@/lib/design-system-keys';
import { QUERY_DEFAULTS } from '@/lib/query-client';
import type { VariableUsageReport } from '@/types/consumers';
import type { ComponentCatalog } from '@/types/component-catalog';
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from '@/types/health-history';
import type { TokenCatalog } from '@/types/token-catalog';
import type { TokenUsageIndex } from '@/types/token-usage-index';

export const healthQueryKeys = {
  componentCatalog: (systemId: string) => ['health', systemId, 'component-catalog'] as const,
  tokenCatalog: (systemId: string) => ['health', systemId, 'token-catalog'] as const,
  tokenUsageIndex: (systemId: string) => ['health', systemId, 'token-usage-index'] as const,
  tokenVariableReports: (systemId: string) => ['health', systemId, 'token-variable-reports'] as const,
  history: (
    systemId: string,
    range: HealthHistoryRange,
    bucket: HealthHistoryBucket,
  ) => ['health', systemId, 'history', range, bucket] as const,
};

export function useComponentCatalogQuery(systemId: string) {
  return useQuery<ComponentCatalog>({
    queryKey: healthQueryKeys.componentCatalog(systemId),
    queryFn: () => fetchComponentCatalog(systemId || undefined),
    ...QUERY_DEFAULTS,
  });
}

export function useTokenCatalogQuery(systemId: string) {
  return useQuery<TokenCatalog>({
    queryKey: healthQueryKeys.tokenCatalog(systemId),
    queryFn: () => fetchTokenCatalog(systemId || undefined),
    ...QUERY_DEFAULTS,
  });
}

export function useTokenUsageIndexQuery(systemId: string) {
  return useQuery<TokenUsageIndex>({
    queryKey: healthQueryKeys.tokenUsageIndex(systemId),
    queryFn: () => fetchTokenUsageIndex(systemId || undefined),
    ...QUERY_DEFAULTS,
  });
}

export function useTokenVariableReportsQuery(systemId: string) {
  return useQuery<VariableUsageReport[]>({
    queryKey: healthQueryKeys.tokenVariableReports(systemId),
    queryFn: async () => {
      const config = await fetchDesignSystemsConfig();
      const { dsFileKey } = resolveDesignSystemContext(config, String(systemId || "").trim());
      if (!dsFileKey) return [];
      const payload = await fetchReportByVariable(dsFileKey);
      return payload.data ?? [];
    },
    ...QUERY_DEFAULTS,
  });
}

export function useHealthHistoryQuery(
  systemId: string,
  range: HealthHistoryRange,
  bucket: HealthHistoryBucket,
) {
  return useQuery<HealthHistoryReport>({
    queryKey: healthQueryKeys.history(systemId, range, bucket),
    queryFn: () => fetchHealthHistory({ systemId, range, bucket }),
    ...QUERY_DEFAULTS,
  });
}

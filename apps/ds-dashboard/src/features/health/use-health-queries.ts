import { fetchComponentCatalog, fetchHealthHistory, fetchTokenHealth } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { QUERY_DEFAULTS } from '@/lib/query-client';
import type { ComponentCatalog } from '@/types/component-catalog';
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from '@/types/health-history';
import type { TokenHealthReport } from '@/types/token-health';

export const healthQueryKeys = {
  componentCatalog: (systemId: string) => ['health', systemId, 'component-catalog'] as const,
  token: (systemId: string) => ['health', systemId, 'token'] as const,
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

export function useTokenHealthQuery(systemId: string) {
  return useQuery<TokenHealthReport>({
    queryKey: healthQueryKeys.token(systemId),
    queryFn: () => fetchTokenHealth(systemId),
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

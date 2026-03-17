import {
  fetchComponentsHealth,
  fetchHealthHistory,
  fetchNamingDebt,
  fetchTokenHealth,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { QUERY_DEFAULTS } from "@/lib/query-client";
import type { ComponentsHealthReport } from "@/types/components-health";
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from "@/types/health-history";
import type { NamingDebtReport } from "@/types/naming-debt";
import type { TokenHealthReport } from "@/types/token-health";

export const healthQueryKeys = {
  token: ["health", "token"] as const,
  components: ["health", "components"] as const,
  namingDebt: ["health", "naming-debt"] as const,
  history: (range: HealthHistoryRange, bucket: HealthHistoryBucket) =>
    ["health", "history", range, bucket] as const,
};

export function useTokenHealthQuery() {
  return useQuery<TokenHealthReport>({
    queryKey: healthQueryKeys.token,
    queryFn: () => fetchTokenHealth(),
    ...QUERY_DEFAULTS,
  });
}

export function useComponentsHealthQuery() {
  return useQuery<ComponentsHealthReport>({
    queryKey: healthQueryKeys.components,
    queryFn: () => fetchComponentsHealth(),
    ...QUERY_DEFAULTS,
  });
}

export function useNamingDebtQuery() {
  return useQuery<NamingDebtReport>({
    queryKey: healthQueryKeys.namingDebt,
    queryFn: () => fetchNamingDebt(),
    ...QUERY_DEFAULTS,
  });
}

export function useHealthHistoryQuery(
  range: HealthHistoryRange,
  bucket: HealthHistoryBucket,
) {
  return useQuery<HealthHistoryReport>({
    queryKey: healthQueryKeys.history(range, bucket),
    queryFn: () => fetchHealthHistory({ range, bucket }),
    ...QUERY_DEFAULTS,
  });
}

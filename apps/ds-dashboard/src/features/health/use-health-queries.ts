import {
  fetchComponentsHealth,
  fetchHealthHistory,
  fetchNamingDebt,
  fetchTokenHealth,
} from "@/lib/api";
import { SERVER_QUERY_POLICY } from "@/lib/server-query-policy";
import { useServerQuery } from "@/lib/server-query";
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
  return useServerQuery<TokenHealthReport>({
    queryKey: healthQueryKeys.token,
    queryFn: fetchTokenHealth,
    ...SERVER_QUERY_POLICY,
  });
}

export function useComponentsHealthQuery() {
  return useServerQuery<ComponentsHealthReport>({
    queryKey: healthQueryKeys.components,
    queryFn: fetchComponentsHealth,
    ...SERVER_QUERY_POLICY,
  });
}

export function useNamingDebtQuery() {
  return useServerQuery<NamingDebtReport>({
    queryKey: healthQueryKeys.namingDebt,
    queryFn: fetchNamingDebt,
    ...SERVER_QUERY_POLICY,
  });
}

export function useHealthHistoryQuery(
  range: HealthHistoryRange,
  bucket: HealthHistoryBucket,
) {
  return useServerQuery<HealthHistoryReport>({
    queryKey: healthQueryKeys.history(range, bucket),
    queryFn: () => fetchHealthHistory({ range, bucket }),
    ...SERVER_QUERY_POLICY,
  });
}

import { useCallback, useMemo, useState } from "react";

import {
  captureHealthSnapshot,
  refreshComponentsHealth,
  refreshTokenHealth,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { invalidateServerQuery } from "@/lib/server-query";
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
} from "@/types/health-history";
import {
  healthQueryKeys,
  useComponentsHealthQuery,
  useHealthHistoryQuery,
  useNamingDebtQuery,
  useTokenHealthQuery,
} from "./use-health-queries";

export function useHealthDashboardData(args: {
  historyRange: HealthHistoryRange;
  historyBucket: HealthHistoryBucket;
}) {
  const { historyRange, historyBucket } = args;
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [refreshingComponents, setRefreshingComponents] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [tokenRefreshError, setTokenRefreshError] = useState<ApiErrorDisplay | null>(null);
  const [componentsRefreshError, setComponentsRefreshError] =
    useState<ApiErrorDisplay | null>(null);
  const [snapshotError, setSnapshotError] = useState<ApiErrorDisplay | null>(null);

  const tokenHealthQuery = useTokenHealthQuery();
  const componentsHealthQuery = useComponentsHealthQuery();
  const namingDebtQuery = useNamingDebtQuery();
  const historyQuery = useHealthHistoryQuery(historyRange, historyBucket);

  const tokenHealth = tokenHealthQuery.data ?? null;
  const componentsHealth = componentsHealthQuery.data ?? null;
  const namingDebt = namingDebtQuery.data ?? null;
  const history = historyQuery.data ?? null;
  const loading = tokenHealthQuery.isLoading || componentsHealthQuery.isLoading;
  const historyLoading = historyQuery.isLoading || historyQuery.isFetching;
  const reloadingAll =
    tokenHealthQuery.isFetching || componentsHealthQuery.isFetching || namingDebtQuery.isFetching;

  const queryTokenError = useMemo(() => {
    if (!tokenHealthQuery.error) return null;
    return toApiErrorDisplay(tokenHealthQuery.error, {
      fallbackTitle: "Token health unavailable",
      fallbackMessage: "Unable to load token health report.",
    });
  }, [tokenHealthQuery.error]);
  const queryComponentsError = useMemo(() => {
    if (!componentsHealthQuery.error) return null;
    return toApiErrorDisplay(componentsHealthQuery.error, {
      fallbackTitle: "Components health unavailable",
      fallbackMessage: "Unable to load components health report.",
    });
  }, [componentsHealthQuery.error]);
  const namingError = useMemo(() => {
    if (!namingDebtQuery.error) return null;
    return toApiErrorDisplay(namingDebtQuery.error, {
      fallbackTitle: "Naming report unavailable",
      fallbackMessage: "Unable to load naming debt report.",
    });
  }, [namingDebtQuery.error]);
  const queryHistoryError = useMemo(() => {
    if (!historyQuery.error) return null;
    return toApiErrorDisplay(historyQuery.error, {
      fallbackTitle: "Health history unavailable",
      fallbackMessage: "Unable to load health history.",
    });
  }, [historyQuery.error]);

  const tokenError = tokenRefreshError ?? queryTokenError;
  const componentsError = componentsRefreshError ?? queryComponentsError;
  const historyError = snapshotError ?? queryHistoryError;

  const reloadAll = useCallback(async () => {
    setTokenRefreshError(null);
    setComponentsRefreshError(null);
    await Promise.all([
      tokenHealthQuery.refetch(),
      componentsHealthQuery.refetch(),
      namingDebtQuery.refetch(),
    ]);
  }, [componentsHealthQuery, namingDebtQuery, tokenHealthQuery]);

  const reloadHistory = useCallback(async () => {
    await historyQuery.refetch();
  }, [historyQuery]);

  const refreshTokenReport = useCallback(async () => {
    setRefreshingTokens(true);
    setTokenRefreshError(null);
    try {
      await refreshTokenHealth();
      invalidateServerQuery(healthQueryKeys.token);
      await tokenHealthQuery.refetch();
    } catch (cause) {
      setTokenRefreshError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Token health refresh failed",
          fallbackMessage: "Unable to refresh token health report.",
        }),
      );
    } finally {
      setRefreshingTokens(false);
    }
  }, [tokenHealthQuery]);

  const refreshComponentsReport = useCallback(async () => {
    setRefreshingComponents(true);
    setComponentsRefreshError(null);
    try {
      await refreshComponentsHealth();
      invalidateServerQuery(healthQueryKeys.components);
      await componentsHealthQuery.refetch();
    } catch (cause) {
      setComponentsRefreshError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Components health refresh failed",
          fallbackMessage: "Unable to refresh components health report.",
        }),
      );
    } finally {
      setRefreshingComponents(false);
    }
  }, [componentsHealthQuery]);

  const captureSnapshotAndReload = useCallback(async () => {
    setSnapshotting(true);
    setSnapshotError(null);
    try {
      await captureHealthSnapshot();
      invalidateServerQuery(healthQueryKeys.token);
      invalidateServerQuery(healthQueryKeys.components);
      invalidateServerQuery(healthQueryKeys.namingDebt);
      invalidateServerQuery(healthQueryKeys.history(historyRange, historyBucket));
      await Promise.all([reloadAll(), historyQuery.refetch()]);
    } catch (cause) {
      setSnapshotError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Snapshot capture failed",
          fallbackMessage: "Unable to capture a health snapshot.",
        }),
      );
    } finally {
      setSnapshotting(false);
    }
  }, [historyBucket, historyQuery, historyRange, reloadAll]);

  return {
    tokenHealth,
    componentsHealth,
    namingDebt,
    history,
    loading,
    historyLoading,
    reloadingAll,
    refreshingTokens,
    refreshingComponents,
    snapshotting,
    tokenError,
    componentsError,
    namingError,
    historyError,
    reloadAll,
    reloadHistory,
    refreshTokenReport,
    refreshComponentsReport,
    captureSnapshotAndReload,
  };
}

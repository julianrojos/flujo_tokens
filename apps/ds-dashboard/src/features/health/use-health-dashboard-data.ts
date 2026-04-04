import { useCallback, useMemo } from "react";

import {
  captureHealthSnapshot,
  refreshComponentsHealth,
  refreshTokenHealth,
} from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
} from "@/types/health-history";
import {
  healthQueryKeys,
  useComponentsHealthQuery,
  useHealthHistoryQuery,
  useTokenHealthQuery,
} from "./use-health-queries";

export function useHealthDashboardData(args: {
  historyRange: HealthHistoryRange;
  historyBucket: HealthHistoryBucket;
}) {
  const { historyRange, historyBucket } = args;
  const queryClient = useQueryClient();

  const tokenHealthQuery = useTokenHealthQuery();
  const componentsHealthQuery = useComponentsHealthQuery();
  const historyQuery = useHealthHistoryQuery(historyRange, historyBucket);

  const tokenHealth = tokenHealthQuery.data ?? null;
  const componentsHealth = componentsHealthQuery.data ?? null;
  const history = historyQuery.data ?? null;
  const loading = tokenHealthQuery.isLoading || componentsHealthQuery.isLoading;
  const historyLoading = historyQuery.isLoading || historyQuery.isFetching;
  const reloadingAll =
    tokenHealthQuery.isFetching || componentsHealthQuery.isFetching;

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
  const queryHistoryError = useMemo(() => {
    if (!historyQuery.error) return null;
    return toApiErrorDisplay(historyQuery.error, {
      fallbackTitle: "Health history unavailable",
      fallbackMessage: "Unable to load health history.",
    });
  }, [historyQuery.error]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      tokenHealthQuery.refetch(),
      componentsHealthQuery.refetch(),
    ]);
  }, [componentsHealthQuery, tokenHealthQuery]);

  const reloadHistory = useCallback(async () => {
    await historyQuery.refetch();
  }, [historyQuery]);

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      await refreshTokenHealth();
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.token });
      await tokenHealthQuery.refetch();
    },
  });
  const refreshComponentsMutation = useMutation({
    mutationFn: async () => {
      await refreshComponentsHealth();
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.components });
      await componentsHealthQuery.refetch();
    },
  });
  const snapshotMutation = useMutation({
    mutationFn: async () => {
      await captureHealthSnapshot();
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.token });
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.components });
      await queryClient.invalidateQueries({
        queryKey: healthQueryKeys.history(historyRange, historyBucket),
      });
      await Promise.all([reloadAll(), historyQuery.refetch()]);
    },
  });

  const refreshingTokens = refreshTokenMutation.isPending;
  const refreshingComponents = refreshComponentsMutation.isPending;
  const snapshotting = snapshotMutation.isPending;

  const tokenRefreshError = useMemo(() => {
    if (!refreshTokenMutation.error) return null;
    return toApiErrorDisplay(refreshTokenMutation.error, {
      fallbackTitle: "Token health refresh failed",
      fallbackMessage: "Unable to refresh token health report.",
    });
  }, [refreshTokenMutation.error]);
  const componentsRefreshError = useMemo(() => {
    if (!refreshComponentsMutation.error) return null;
    return toApiErrorDisplay(refreshComponentsMutation.error, {
      fallbackTitle: "Components health refresh failed",
      fallbackMessage: "Unable to refresh components health report.",
    });
  }, [refreshComponentsMutation.error]);
  const snapshotError = useMemo(() => {
    if (!snapshotMutation.error) return null;
    return toApiErrorDisplay(snapshotMutation.error, {
      fallbackTitle: "Snapshot capture failed",
      fallbackMessage: "Unable to capture a health snapshot.",
    });
  }, [snapshotMutation.error]);

  const tokenError = tokenRefreshError ?? queryTokenError;
  const componentsError = componentsRefreshError ?? queryComponentsError;
  const historyError = snapshotError ?? queryHistoryError;

  const refreshTokenReport = useCallback(async () => {
    try {
      await refreshTokenMutation.mutateAsync();
    } catch {
      // Error is already exposed via tokenRefreshError.
    }
  }, [refreshTokenMutation]);
  const refreshComponentsReport = useCallback(async () => {
    try {
      await refreshComponentsMutation.mutateAsync();
    } catch {
      // Error is already exposed via componentsRefreshError.
    }
  }, [refreshComponentsMutation]);
  const captureSnapshotAndReload = useCallback(async () => {
    try {
      await snapshotMutation.mutateAsync();
    } catch {
      // Error is already exposed via snapshotError.
    }
  }, [snapshotMutation]);

  return {
    tokenHealth,
    componentsHealth,
    history,
    loading,
    historyLoading,
    reloadingAll,
    refreshingTokens,
    refreshingComponents,
    snapshotting,
    tokenError,
    componentsError,
    historyError,
    reloadAll,
    reloadHistory,
    refreshTokenReport,
    refreshComponentsReport,
    captureSnapshotAndReload,
  };
}

import { useCallback, useMemo } from "react";

import {
  captureHealthSnapshot,
  refreshComponentsHealth,
  refreshTokenHealth,
} from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import {
  healthQueryKeys,
  useComponentsHealthQuery,
  useTokenHealthQuery,
} from "./use-health-queries";

export function useHealthDashboardData() {
  const queryClient = useQueryClient();

  const tokenHealthQuery = useTokenHealthQuery();
  const componentsHealthQuery = useComponentsHealthQuery();

  const tokenHealth = tokenHealthQuery.data ?? null;
  const componentsHealth = componentsHealthQuery.data ?? null;
  const loading = tokenHealthQuery.isLoading || componentsHealthQuery.isLoading;
  const reloadingAll =
    tokenHealthQuery.isFetching || componentsHealthQuery.isFetching;

  const queryTokenError = useMemo(() => {
    if (!tokenHealthQuery.error) return null;
    return toApiErrorDisplay(tokenHealthQuery.error, {
      fallbackTitle: "Token system unavailable",
      fallbackMessage: "Unable to load token system report.",
    });
  }, [tokenHealthQuery.error]);
  const queryComponentsError = useMemo(() => {
    if (!componentsHealthQuery.error) return null;
    return toApiErrorDisplay(componentsHealthQuery.error, {
      fallbackTitle: "Components system unavailable",
      fallbackMessage: "Unable to load components system report.",
    });
  }, [componentsHealthQuery.error]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      tokenHealthQuery.refetch(),
      componentsHealthQuery.refetch(),
    ]);
  }, [componentsHealthQuery, tokenHealthQuery]);

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
      await reloadAll();
    },
  });

  const refreshingTokens = refreshTokenMutation.isPending;
  const refreshingComponents = refreshComponentsMutation.isPending;
  const snapshotting = snapshotMutation.isPending;

  const tokenRefreshError = useMemo(() => {
    if (!refreshTokenMutation.error) return null;
    return toApiErrorDisplay(refreshTokenMutation.error, {
      fallbackTitle: "Token system refresh failed",
      fallbackMessage: "Unable to refresh token system report.",
    });
  }, [refreshTokenMutation.error]);
  const componentsRefreshError = useMemo(() => {
    if (!refreshComponentsMutation.error) return null;
    return toApiErrorDisplay(refreshComponentsMutation.error, {
      fallbackTitle: "Components system refresh failed",
      fallbackMessage: "Unable to refresh components system report.",
    });
  }, [refreshComponentsMutation.error]);
  const snapshotError = useMemo(() => {
    if (!snapshotMutation.error) return null;
    return toApiErrorDisplay(snapshotMutation.error, {
      fallbackTitle: "Snapshot capture failed",
      fallbackMessage: "Unable to capture a system snapshot.",
    });
  }, [snapshotMutation.error]);

  const tokenError = tokenRefreshError ?? queryTokenError;
  const componentsError = componentsRefreshError ?? queryComponentsError;
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
    loading,
    reloadingAll,
    refreshingTokens,
    refreshingComponents,
    snapshotting,
    tokenError,
    componentsError,
    reloadAll,
    refreshTokenReport,
    refreshComponentsReport,
    captureSnapshotAndReload,
  };
}

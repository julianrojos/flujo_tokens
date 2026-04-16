import { useCallback, useMemo } from 'react';

import { captureHealthSnapshot, refreshTokenHealth } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiErrorDisplay } from '@/lib/api-error-ux';
import { healthQueryKeys, useTokenHealthQuery } from './use-health-queries';

export function useHealthDashboardData() {
  const queryClient = useQueryClient();

  const tokenHealthQuery = useTokenHealthQuery();

  const tokenHealth = tokenHealthQuery.data ?? null;
  const loading = tokenHealthQuery.isLoading;
  const reloadingAll = tokenHealthQuery.isFetching;

  const queryTokenError = useMemo(() => {
    if (!tokenHealthQuery.error) return null;
    return toApiErrorDisplay(tokenHealthQuery.error, {
      fallbackTitle: 'Token system unavailable',
      fallbackMessage: 'Unable to load token system report.',
    });
  }, [tokenHealthQuery.error]);

  const reloadAll = useCallback(async () => {
    await tokenHealthQuery.refetch();
  }, [tokenHealthQuery]);

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      await refreshTokenHealth();
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.token });
      await tokenHealthQuery.refetch();
    },
  });
  const snapshotMutation = useMutation({
    mutationFn: async () => {
      await captureHealthSnapshot();
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.token });
      await reloadAll();
    },
  });

  const refreshingTokens = refreshTokenMutation.isPending;
  const snapshotting = snapshotMutation.isPending;

  const tokenRefreshError = useMemo(() => {
    if (!refreshTokenMutation.error) return null;
    return toApiErrorDisplay(refreshTokenMutation.error, {
      fallbackTitle: 'Token system refresh failed',
      fallbackMessage: 'Unable to refresh token system report.',
    });
  }, [refreshTokenMutation.error]);
  const snapshotError = useMemo(() => {
    if (!snapshotMutation.error) return null;
    return toApiErrorDisplay(snapshotMutation.error, {
      fallbackTitle: 'Snapshot capture failed',
      fallbackMessage: 'Unable to capture a system snapshot.',
    });
  }, [snapshotMutation.error]);

  const tokenError = tokenRefreshError ?? queryTokenError;
  const refreshTokenReport = useCallback(async () => {
    try {
      await refreshTokenMutation.mutateAsync();
    } catch {
      // Error is already exposed via tokenRefreshError.
    }
  }, [refreshTokenMutation]);
  const captureSnapshotAndReload = useCallback(async () => {
    try {
      await snapshotMutation.mutateAsync();
    } catch {
      // Error is already exposed via snapshotError.
    }
  }, [snapshotMutation]);

  return {
    tokenHealth,
    loading,
    reloadingAll,
    refreshingTokens,
    snapshotting,
    tokenError,
    reloadAll,
    refreshTokenReport,
    captureSnapshotAndReload,
  };
}

import { useCallback, useMemo } from 'react';

import { captureHealthSnapshot } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiErrorDisplay } from '@/lib/api-error-ux';
import {
  healthQueryKeys,
  useComponentCatalogQuery,
  useTokenHealthQuery,
} from './use-health-queries';

export function useHealthDashboardData(systemId: string) {
  const queryClient = useQueryClient();

  const componentCatalogQuery = useComponentCatalogQuery(systemId);
  const tokenHealthQuery = useTokenHealthQuery(systemId);

  const componentCatalog = componentCatalogQuery.data ?? null;
  const tokenHealth = tokenHealthQuery.data ?? null;
  const loading = tokenHealthQuery.isLoading || componentCatalogQuery.isLoading;
  const reloadingAll = tokenHealthQuery.isFetching || componentCatalogQuery.isFetching;

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

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      await captureHealthSnapshot({ systemId });
      await queryClient.invalidateQueries({ queryKey: healthQueryKeys.token(systemId) });
      await reloadAll();
    },
  });

  const snapshotting = snapshotMutation.isPending;

  const tokenError = queryTokenError;
  const captureSnapshotAndReload = useCallback(async () => {
    try {
      await snapshotMutation.mutateAsync();
    } catch {
      // Error is already exposed via the mutation state.
    }
  }, [snapshotMutation]);

  return {
    componentCatalog,
    tokenHealth,
    loading,
    reloadingAll,
    snapshotting,
    tokenError,
    reloadAll,
    captureSnapshotAndReload,
  };
}

import { useCallback, useMemo } from 'react';

import { captureHealthSnapshot } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiErrorDisplay } from '@/lib/api-error-ux';
import {
  healthQueryKeys,
  useComponentCatalogQuery,
  useDesignSystemsConfigQuery,
  useTokenCatalogQuery,
  useTokenHealthQuery,
} from './use-health-queries';

export function useHealthDashboardData(systemId: string) {
  const queryClient = useQueryClient();

  const designSystemsConfigQuery = useDesignSystemsConfigQuery();
  const componentCatalogQuery = useComponentCatalogQuery(systemId);
  const tokenCatalogQuery = useTokenCatalogQuery(systemId);
  const tokenHealthQuery = useTokenHealthQuery(systemId);

  const designSystemsConfig = designSystemsConfigQuery.data ?? null;
  const componentCatalog = componentCatalogQuery.data ?? null;
  const tokenCatalog = tokenCatalogQuery.data ?? null;
  const tokenHealth = tokenHealthQuery.data ?? null;
  const loading =
    designSystemsConfigQuery.isLoading ||
    tokenHealthQuery.isLoading ||
    componentCatalogQuery.isLoading ||
    tokenCatalogQuery.isLoading;
  const reloadingAll =
    designSystemsConfigQuery.isFetching ||
    tokenHealthQuery.isFetching ||
    componentCatalogQuery.isFetching ||
    tokenCatalogQuery.isFetching;

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
    designSystemsConfig,
    componentCatalog,
    tokenCatalog,
    tokenHealth,
    loading,
    reloadingAll,
    snapshotting,
    tokenError,
    reloadAll,
    captureSnapshotAndReload,
  };
}

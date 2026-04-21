import { useMemo } from 'react';

import { useHealthDashboardData } from '@/features/health/use-health-dashboard-data';

export function useHealthDashboard(systemId: string) {
  const {
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
  } = useHealthDashboardData(systemId);

  const totalComponents = useMemo(
    () => componentCatalog?.summary.total_components ?? 0,
    [componentCatalog],
  );
  const componentsWithEditorial = useMemo(
    () => componentCatalog?.summary.with_editorial ?? 0,
    [componentCatalog],
  );
  const componentsWithoutDocsPercent = useMemo(() => {
    if (totalComponents <= 0) return 0;
    const withoutDocs = Math.max(0, totalComponents - componentsWithEditorial);
    return Math.round((withoutDocs / totalComponents) * 100);
  }, [componentsWithEditorial, totalComponents]);
  const tokensTotal = useMemo(
    () =>
      tokenCatalog?.entries.length ??
      tokenHealth?.summary.tokens_total ??
      0,
    [tokenCatalog, tokenHealth],
  );
  const tokensWithoutUse = useMemo(
    () => tokenHealth?.summary.unused_tokens_total ?? 0,
    [tokenHealth],
  );
  const importedComponentsCount = useMemo(() => {
    const system = designSystemsConfig?.systems.find((entry) => entry.id === systemId);
    return Number(system?.importedComponentsCount ?? 0);
  }, [designSystemsConfig, systemId]);
  const scannedComponentsCount = useMemo(() => {
    const system = designSystemsConfig?.systems.find((entry) => entry.id === systemId);
    const detected = system?.detectedComponentsCount;
    return typeof detected === 'number' && Number.isFinite(detected)
      ? detected
      : totalComponents;
  }, [designSystemsConfig, systemId, totalComponents]);

  return {
    tokenHealth,
    loading,
    reloadingAll,
    snapshotting,
    tokenError,
    reloadAll,
    captureSnapshotAndReload,
    tokensTotal,
    totalComponents,
    tokensWithoutUse,
    componentsWithoutDocsPercent,
    importedComponentsCount,
    scannedComponentsCount,
  };
}

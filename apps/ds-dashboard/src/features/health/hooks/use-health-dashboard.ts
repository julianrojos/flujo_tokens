import { useCallback, useMemo, type MouseEvent } from 'react';

import { useHealthDashboardData } from '@/features/health/use-health-dashboard-data';

interface DashboardIssue {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: 'critical' | 'warning';
  to: string;
}

export function useHealthDashboard(systemId: string) {
  const {
    componentCatalog,
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
  const tokensTotal = useMemo(
    () => tokenHealth?.summary.tokens_total ?? 0,
    [tokenHealth],
  );

  const activeIssues = useMemo<DashboardIssue[]>(() => {
    if (!tokenHealth) return [];
    const issues: DashboardIssue[] = [];
    if (tokenHealth.summary.wcag_failures_total > 0) {
      issues.push({
        id: 'wcag-failures',
        label: 'WCAG failures',
        description: `${tokenHealth.summary.wcag_failures_total} color contrast failures`,
        count: tokenHealth.summary.wcag_failures_total,
        severity: 'critical',
        to: '/tokens',
      });
    }
    if (tokenHealth.summary.unused_tokens_total > 0) {
      issues.push({
        id: 'unused-tokens',
        label: 'Unused tokens',
        description: `${tokenHealth.summary.unused_tokens_total} tokens are not referenced`,
        count: tokenHealth.summary.unused_tokens_total,
        severity: 'warning',
        to: '/tokens',
      });
    }
    return issues;
  }, [tokenHealth]);
  const handleIssueViewClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, to: string) => {
      if (!to.startsWith('#')) return;
      event.preventDefault();
      const hash = to.split('#')[1];
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [],
  );

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
    activeIssues,
    handleIssueViewClick,
  };
}

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

export function useHealthDashboard() {
  const {
    tokenHealth,
    loading,
    reloadingAll,
    snapshotting,
    tokenError,
    reloadAll,
    captureSnapshotAndReload,
  } = useHealthDashboardData();

  const tokensTotal = useMemo(
    () => (tokenHealth ? Math.max(tokenHealth.summary.tokens_total, 1) : 0),
    [tokenHealth],
  );
  const tokenScore = useMemo(
    () =>
      tokenHealth?.summary
        ? Math.max(
            0,
            Math.round(
              100 -
                Math.min(
                  30,
                  (tokenHealth.summary.unused_tokens_total /
                    Math.max(1, tokenHealth.summary.tokens_total)) *
                    35,
                ) -
                Math.min(
                  20,
                  (tokenHealth.summary.high_coupling_tokens_total /
                    Math.max(1, tokenHealth.summary.tokens_total)) *
                    25,
                ) -
                Math.min(
                  20,
                  (tokenHealth.summary.broken_css_var_refs_total /
                    Math.max(1, tokenHealth.summary.tokens_total)) *
                    120,
                ) -
                Math.min(
                  20,
                  (tokenHealth.summary.wcag_failures_total /
                    Math.max(1, tokenHealth.summary.tokens_total)) *
                    140,
                ),
            ),
          )
        : 0,
    [tokenHealth],
  );
  const overallScore = useMemo(() => Math.round(tokenScore), [tokenScore]);

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
    tokenScore,
    overallScore,
    activeIssues,
    handleIssueViewClick,
  };
}

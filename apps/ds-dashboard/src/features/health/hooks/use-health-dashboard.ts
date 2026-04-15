import { useCallback, useMemo, useState, type MouseEvent } from 'react';

import { useSortState } from '@/lib/use-sort-state';
import type {
  HealthHistoryBucket,
  HealthHistoryRange,
} from '@/types/health-history';
import { useHealthDashboardData } from '@/features/health/use-health-dashboard-data';

interface DashboardIssue {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: 'critical' | 'warning';
  to: string;
}

function compareStrings(a: string, b: string, dir: 'asc' | 'desc'): number {
  const result = a.localeCompare(b);
  return dir === 'asc' ? result : -result;
}

export function useHealthDashboard() {
  const [historyRange, setHistoryRange] = useState<HealthHistoryRange>('30d');
  const [historyBucket, setHistoryBucket] =
    useState<HealthHistoryBucket>('day');
  const [brokenAliasSort, toggleBrokenAliasSort] = useSortState<
    'token' | 'alias' | 'reason'
  >({
    field: 'token',
    dir: 'asc',
  });

  const {
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
  } = useHealthDashboardData({ historyRange, historyBucket });

  const tokensTotal = useMemo(
    () => (tokenHealth ? Math.max(tokenHealth.summary.tokens_total, 1) : 0),
    [tokenHealth],
  );
  const componentsTotal = useMemo(
    () =>
      componentsHealth
        ? Math.max(componentsHealth.summary.total_components, 1)
        : 0,
    [componentsHealth],
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
                  (tokenHealth.summary.broken_aliases_total /
                    Math.max(1, tokenHealth.summary.tokens_total)) *
                    160,
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
  const componentsScore = componentsHealth
    ? Math.round(
        (componentsHealth.summary.with_spec /
          Math.max(1, componentsHealth.summary.total_components)) *
          60 +
          (componentsHealth.summary.average_coverage_percent / 100) * 40,
      )
    : 0;
  const overallScore = useMemo(
    () => Math.round(tokenScore * 0.55 + componentsScore * 0.45),
    [tokenScore, componentsScore],
  );

  const activeIssues = useMemo<DashboardIssue[]>(() => {
    if (!tokenHealth || !componentsHealth) return [];
    const issues: DashboardIssue[] = [];
    if (tokenHealth.summary.broken_aliases_total > 0) {
      issues.push({
        id: 'broken-aliases',
        label: 'Broken aliases',
        description: `${tokenHealth.summary.broken_aliases_total} tokens have broken alias references`,
        count: tokenHealth.summary.broken_aliases_total,
        severity: 'critical',
        to: `#broken-aliases`,
      });
    }
    if (tokenHealth.summary.wcag_failures_total > 0) {
      issues.push({
        id: 'wcag-failures',
        label: 'WCAG failures',
        description: `${tokenHealth.summary.wcag_failures_total} color contrast failures`,
        count: tokenHealth.summary.wcag_failures_total,
        severity: 'critical',
        to: `#wcag-failures`,
      });
    }
    if (tokenHealth.summary.unused_tokens_total > 0) {
      issues.push({
        id: 'unused-tokens',
        label: 'Unused tokens',
        description: `${tokenHealth.summary.unused_tokens_total} tokens are not referenced`,
        count: tokenHealth.summary.unused_tokens_total,
        severity: 'warning',
        to: `#unused-tokens`,
      });
    }
    if (componentsHealth.summary.without_spec > 0) {
      issues.push({
        id: 'missing-specs',
        label: 'Missing specs',
        description: `${componentsHealth.summary.without_spec} components have no spec`,
        count: componentsHealth.summary.without_spec,
        severity: 'warning',
        to: `#at-risk-components`,
      });
    }
    return issues;
  }, [tokenHealth, componentsHealth]);

  const brokenAliases = useMemo(() => {
    const items = tokenHealth?.broken_aliases.items ?? [];
    return items.slice().sort((a, b) => {
      if (brokenAliasSort.field === 'token') {
        return compareStrings(a.token, b.token, brokenAliasSort.dir);
      }
      if (brokenAliasSort.field === 'alias') {
        return compareStrings(
          a.aliasCssVar,
          b.aliasCssVar,
          brokenAliasSort.dir,
        );
      }
      return compareStrings(a.reason, b.reason, brokenAliasSort.dir);
    });
  }, [tokenHealth, brokenAliasSort.field, brokenAliasSort.dir]);

  const topUnusedTokens = useMemo(
    () => tokenHealth?.unused_tokens.items.slice(0, 10) ?? [],
    [tokenHealth],
  );
  const topHighCouplingTokens = useMemo(
    () => tokenHealth?.high_coupling_tokens.items.slice(0, 10) ?? [],
    [tokenHealth],
  );
  const topWcagFailures = useMemo(
    () => tokenHealth?.wcag_failures.items.slice(0, 10) ?? [],
    [tokenHealth],
  );
  const handleIssueViewClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, to: string) => {
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
    historyRange,
    setHistoryRange,
    historyBucket,
    setHistoryBucket,
    brokenAliasSort,
    toggleBrokenAliasSort,
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
    tokensTotal,
    componentsTotal,
    tokenScore,
    componentsScore,
    overallScore,
    activeIssues,
    brokenAliases,
    topUnusedTokens,
    topHighCouplingTokens,
    topWcagFailures,
    handleIssueViewClick,
  };
}

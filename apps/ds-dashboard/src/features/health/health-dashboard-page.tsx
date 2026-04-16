/**
 * Health Dashboard Page - orchestrator only.
 */

import {
  PageHeader,
  StatsOverview,
  SystemTabsNav,
} from '@/components/composites';
import { useHealthDashboard } from './hooks/use-health-dashboard';
import { HealthActiveIssues } from './components/health-active-issues';
import { HealthTokenPriorities } from './components/health-token-priorities';
import { HealthBrokenAliases } from './components/health-broken-aliases';

export function HealthDashboardPage() {
  const {
    toggleBrokenAliasSort,
    tokenHealth,
    loading,
    refreshingTokens,
    refreshTokenReport,
    tokensTotal,
    tokenScore,
    overallScore,
    activeIssues,
    brokenAliases,
    topUnusedTokens,
    topHighCouplingTokens,
    topWcagFailures,
    handleIssueViewClick,
  } = useHealthDashboard();

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading…" description="Loading system dashboard" />
        <SystemTabsNav />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Dashboard"
        description="Token system overview"
      />
      <SystemTabsNav />

      <StatsOverview
        items={[
          {
            id: 'overall-system',
            label: 'Overall System',
            value: `${overallScore} / 100`,
          },
          {
            id: 'tokens',
            label: 'Tokens',
            value: `${tokensTotal} (${tokenScore}/100)`,
          },
        ]}
      />

      <HealthActiveIssues
        issues={activeIssues}
        onIssueClick={handleIssueViewClick}
      />

      {tokenHealth && (
        <HealthTokenPriorities
          unusedTokens={topUnusedTokens}
          highCouplingTokens={topHighCouplingTokens}
          wcagFailures={topWcagFailures}
          onRefreshTokens={refreshTokenReport}
          refreshing={refreshingTokens}
        />
      )}

      {tokenHealth && (
        <HealthBrokenAliases
          aliases={brokenAliases}
          onSort={toggleBrokenAliasSort}
        />
      )}
    </div>
  );
}

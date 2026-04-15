/**
 * Health Dashboard Page - orchestrator only.
 */

import { PageHeader, StatsOverview, SystemTabsNav } from "@/components/composites";
import { useHealthDashboard } from "./hooks/use-health-dashboard";
import { HealthActiveIssues } from "./components/health-active-issues";
import { HealthSpecProgress } from "./components/health-spec-progress";
import { HealthTokenPriorities } from "./components/health-token-priorities";
import { HealthBrokenAliases } from "./components/health-broken-aliases";

export function HealthDashboardPage() {
  const {
    toggleBrokenAliasSort,
    tokenHealth,
    componentsHealth,
    loading,
    refreshingTokens,
    refreshTokenReport,
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
        description="Token and component system overview"
      />
      <SystemTabsNav />

      <StatsOverview
        items={[
          {
            id: "overall-system",
            label: "Overall System",
            value: `${overallScore} / 100`,
          },
          {
            id: "tokens",
            label: "Tokens",
            value: `${tokensTotal} (${tokenScore}/100)`,
          },
          {
            id: "components",
            label: "Components",
            value: `${componentsTotal} (${componentsScore}/100)`,
          },
        ]}
      />

      <HealthActiveIssues
        issues={activeIssues}
        onIssueClick={handleIssueViewClick}
      />

      {componentsHealth && (
        <HealthSpecProgress
          withSpec={componentsHealth.summary.with_spec}
          missing={componentsHealth.summary.without_spec}
          total={componentsTotal}
          anchorId="at-risk-components"
        />
      )}

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

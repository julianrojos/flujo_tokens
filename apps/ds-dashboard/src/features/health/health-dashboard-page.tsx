/**
 * Health Dashboard Page - orchestrator only.
 */

import { PageHeader, SystemTabsNav } from "@/components/composites";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { HealthHistoryBucket, HealthHistoryRange } from "@/types/health-history";
import { RANGE_LABEL } from "./lib/health-transforms";
import { useHealthDashboard } from "./hooks/use-health-dashboard";
import { HealthMetricsOverview } from "./components/health-metrics-overview";
import { HealthActiveIssues } from "./components/health-active-issues";
import { HealthSpecProgress } from "./components/health-spec-progress";
import { HealthTokenPriorities } from "./components/health-token-priorities";
import { HealthBrokenAliases } from "./components/health-broken-aliases";

export function HealthDashboardPage() {
  const {
    historyRange,
    setHistoryRange,
    historyBucket,
    setHistoryBucket,
    toggleBrokenAliasSort,
    tokenHealth,
    componentsHealth,
    loading,
    reloadingAll,
    refreshingTokens,
    reloadAll,
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
        actions={
          <div className="flex items-center gap-2">
            <Select value={historyRange} onChange={(e) => setHistoryRange(e.target.value as HealthHistoryRange)}>
              {Object.entries(RANGE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Select value={historyBucket} onChange={(e) => setHistoryBucket(e.target.value as HealthHistoryBucket)}>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </Select>
            <Button variant="outline" size="sm" onClick={reloadAll} disabled={reloadingAll}>
              {reloadingAll ? "Reloading…" : "Reload all"}
            </Button>
          </div>
        }
      />
      <SystemTabsNav />

      <HealthMetricsOverview
        tokensTotal={tokensTotal}
        componentsTotal={componentsTotal}
        tokenScore={tokenScore}
        componentsScore={componentsScore}
        overallScore={overallScore}
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

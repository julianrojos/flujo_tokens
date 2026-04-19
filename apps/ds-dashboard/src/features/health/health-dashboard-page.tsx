/**
 * Health Dashboard Page - orchestrator only.
 */

import {
  PageHeader,
  StatsOverview,
  SystemTabsNav,
} from '@/components/composites';
import { useParams } from 'react-router-dom';
import { useHealthDashboard } from './hooks/use-health-dashboard';
import { HealthActiveIssues } from './components/health-active-issues';
import { ComponentEditorialCoverageCard } from './components/component-editorial-coverage-card';
import { ComponentTokenDebtCard } from './components/component-token-debt-card';

export function HealthDashboardPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || '').trim();
  const {
    loading,
    tokensTotal,
    tokenScore,
    overallScore,
    activeIssues,
    handleIssueViewClick,
  } = useHealthDashboard(resolvedSystemId);

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

      <section className="grid gap-4 md:grid-cols-2 items-start">
        <ComponentEditorialCoverageCard />
        <ComponentTokenDebtCard />
      </section>

      <HealthActiveIssues
        issues={activeIssues}
        onIssueClick={handleIssueViewClick}
      />
    </div>
  );
}

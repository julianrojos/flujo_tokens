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
import { ComponentEditorialCoverageCard } from './components/component-editorial-coverage-card';
import { ComponentTokenDebtCard } from './components/component-token-debt-card';
import { TokenValueCirclePackingCard } from './components/token-value-circle-packing-card';

export function HealthDashboardPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || '').trim();
  const {
    loading,
    tokensTotal,
    tokensWithoutUse,
    componentsWithoutDocsPercent,
    importedComponentsCount,
    scannedComponentsCount,
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
      />
      <SystemTabsNav />

      <StatsOverview
        items={[
          {
            id: 'overall-system',
            label: 'Imported / scanned components',
            value: `${importedComponentsCount} / ${scannedComponentsCount}`,
          },
          {
            id: 'tokens',
            label: 'Tokens',
            value: String(tokensTotal),
          },
          {
            id: 'tokens-without-use',
            label: 'Unused tokens',
            value: String(tokensWithoutUse),
          },
          {
            id: 'components-without-docs',
            label: 'Undocumented components',
            value: `${componentsWithoutDocsPercent}%`,
          },
        ]}
      />

      <section className="overview-widgets-masonry">
        <ComponentTokenDebtCard />
        <TokenValueCirclePackingCard />
        <ComponentEditorialCoverageCard />
      </section>
    </div>
  );
}

/**
 * Health Dashboard Page - orchestrator only.
 */

import {
  PageHeader,
  SystemTabsNav,
} from '@/components/composites';
import { ComponentEditorialCoverageCard } from './components/component-editorial-coverage-card';
import { ComponentTokenDebtCard } from './components/component-token-debt-card';
import { TokenValueCirclePackingCard } from './components/token-value-circle-packing-card';

export function HealthDashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="System Dashboard"
      />
      <SystemTabsNav />

      <section className="overview-widgets-masonry">
        <ComponentTokenDebtCard />
        <TokenValueCirclePackingCard />
        <ComponentEditorialCoverageCard />
      </section>
    </div>
  );
}

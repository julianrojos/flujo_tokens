/**
 * Health Dashboard Page - orchestrator only.
 */

import {
  PageHeader,
  SystemTabsNav,
} from '@/components/composites';
import { ComponentEditorialCoverageCard } from './components/component-editorial-coverage-card';
import { ComponentTokenDebtCard } from './components/component-token-debt-card';
import { OverviewWidgetsMasonry, type OverviewWidget } from './components/overview-widgets-masonry';
import { TokenHotspotsCard } from './components/token-hotspots-card';
import { TokenValueCirclePackingCard } from './components/token-value-circle-packing-card';

const OVERVIEW_WIDGETS: OverviewWidget[] = [
  { id: 'shared-values', estimatedHeight: 3, render: () => <TokenValueCirclePackingCard /> },
  { id: 'token-hotspots', estimatedHeight: 3, render: () => <TokenHotspotsCard /> },
  { id: 'component-token-debt', estimatedHeight: 2, render: () => <ComponentTokenDebtCard /> },
  { id: 'component-editorial-coverage', estimatedHeight: 1, render: () => <ComponentEditorialCoverageCard /> },
];

export function HealthDashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="System Dashboard"
      />
      <SystemTabsNav />

      <OverviewWidgetsMasonry widgets={OVERVIEW_WIDGETS} />
    </div>
  );
}

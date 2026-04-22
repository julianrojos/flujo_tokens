/**
 * Health Dashboard Page - orchestrator only.
 */

import { useMemo } from 'react';
import {
  PageHeader,
  SystemTabsNav,
} from '@/components/composites';
import { ComponentEditorialCoverageCard } from './components/component-editorial-coverage-card';
import { ComponentTokenDebtCard } from './components/component-token-debt-card';
import { TokenValueCirclePackingCard } from './components/token-value-circle-packing-card';

const OVERVIEW_WIDGETS = [
  { id: 'component-token-debt', render: () => <ComponentTokenDebtCard /> },
  { id: 'shared-values', render: () => <TokenValueCirclePackingCard /> },
  { id: 'component-editorial-coverage', render: () => <ComponentEditorialCoverageCard /> },
];

function shuffleOverviewWidgets() {
  const widgets = [...OVERVIEW_WIDGETS];
  for (let index = widgets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [widgets[index], widgets[swapIndex]] = [widgets[swapIndex], widgets[index]];
  }
  return widgets;
}

export function HealthDashboardPage() {
  const widgets = useMemo(() => shuffleOverviewWidgets(), []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Dashboard"
      />
      <SystemTabsNav />

      <section className="overview-widgets-masonry">
        {widgets.map((widget) => (
          <div key={widget.id}>
            {widget.render()}
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * Operations Page - orchestrator only.
 * Delegates navigation/chrome to shared composites.
 *
 * Note: systemId validation and redirects are handled by SystemTabsLayout.
 * This page assumes a valid systemId from the route.
 */

import { PageHeader, SystemTabsNav } from '@/components/composites';

export function OperationsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Operations"
      />
      <SystemTabsNav />
    </div>
  );
}

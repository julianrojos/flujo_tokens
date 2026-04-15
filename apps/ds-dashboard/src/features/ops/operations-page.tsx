/**
 * Operations Page - orchestrator only.
 * Delegates all logic to hooks and section components.
 * System is fixed by the route param (no internal selector).
 *
 * Note: systemId validation and redirects are handled by SystemTabsLayout.
 * This page assumes a valid systemId from the route.
 */

import { useParams } from 'react-router-dom';
import { PageHeader, SystemTabsNav } from '@/components/composites';
import { OpsActionsSections } from './components/ops-actions-sections';

export function OperationsPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || '').trim();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Operations"
        description="Centro de control para ejecutar operaciones de diagnóstico y mantenimiento."
      />
      <SystemTabsNav />

      <OpsActionsSections systemId={resolvedSystemId} />
    </div>
  );
}

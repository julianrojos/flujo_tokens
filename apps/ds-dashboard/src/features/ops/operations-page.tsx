/**
 * Operations Page - orchestrator only.
 * Delegates all logic to hooks and section components.
 * System is fixed by the route param (no internal selector).
 *
 * Note: systemId validation and redirects are handled by SystemTabsLayout.
 * This page assumes a valid systemId from the route.
 */

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, SystemTabsNav } from '@/components/composites';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import { Zap, Loader2 } from 'lucide-react';
import { REFRESH_ALL_SEQUENCE, useRunAll } from './hooks/use-run-all';
import { useOperationsArtifacts } from './hooks/use-operations-artifacts';
import { OpsArtifactStatusGrid } from './components/ops-artifact-status-grid';
import { OpsActionsSections } from './components/ops-actions-sections';

const RUN_ALL_TOOLTIP = `Regenera artefactos core en secuencia: ${REFRESH_ALL_SEQUENCE.map((step) => step.label).join(' → ')}`;

export function OperationsPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || '').trim();

  const { artifacts, isRefreshing, refreshStatuses } = useOperationsArtifacts({
    systemId: resolvedSystemId || undefined,
  });

  const [runAllState, runAll] = useRunAll(
    () => {
      void refreshStatuses();
    },
    { systemId: resolvedSystemId || undefined },
  );

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const currentStepLabel =
    runAllState.stepIndex > 0
      ? (REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label ?? null)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Operations"
        description="Centro de control para regenerar artefactos core y ejecutar diagnósticos puntuales."
        actions={
          <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
            <Button
              onClick={runAll}
              disabled={runAllState.isRunning || isRefreshing}
              variant={runAllState.failed ? 'destructive' : 'default'}
              size="sm"
              title={RUN_ALL_TOOLTIP}
            >
              {runAllState.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{currentStepLabel ?? '…'}</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 shrink-0" />
                  <span>Actualizar artefactos</span>
                </>
              )}
            </Button>
            {runAllState.isRunning && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                paso {runAllState.stepIndex} de {REFRESH_ALL_SEQUENCE.length}
              </span>
            )}
            {runAllState.failed && !runAllState.isRunning && (
              <span className="text-[10px] text-destructive">
                Error en "{currentStepLabel ?? 'paso desconocido'}"
                {runAllState.errorCode ? ` · ${runAllState.errorCode}` : ''}
                {runAllState.errorMessage
                  ? ` · ${runAllState.errorMessage}`
                  : ''}
              </span>
            )}
          </div>
        }
      />
      <SystemTabsNav />

      <OpsArtifactStatusGrid
        artifacts={artifacts}
        isRefreshing={isRefreshing}
        onRefresh={refreshStatuses}
      />

      <OpsActionsSections
        onRunSuccess={refreshStatuses}
        systemId={resolvedSystemId}
      />
    </div>
  );
}

/**
 * Operations Page - orchestrator only.
 * Delegates all logic to hooks and section components.
 * System is fixed by the route param (no internal selector).
 */

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/composites/page-header";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { Zap, Loader2 } from "lucide-react";
import { REFRESH_ALL_SEQUENCE, useRunAll } from "./hooks/use-run-all";
import { useOperationsArtifacts } from "./hooks/use-operations-artifacts";
import { OpsArtifactStatusGrid } from "./components/ops-artifact-status-grid";
import { OpsActionsSections } from "./components/ops-actions-sections";
import { useDesignSystem } from "@/lib/design-system-context";

const RUN_ALL_TOOLTIP = `Regenera artefactos core en secuencia: ${REFRESH_ALL_SEQUENCE.map((step) => step.label).join(" → ")}`;

export function OperationsPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const { systems } = useDesignSystem();
  const resolvedSystemId = String(systemId || "").trim();

  const systemExists = systems.some((s) => s.id === resolvedSystemId);

  const { artifacts, isRefreshing, refreshStatuses } = useOperationsArtifacts({
    systemId: resolvedSystemId || undefined,
  });

  const [runAllState, runAll] = useRunAll(() => {
    void refreshStatuses();
  }, { systemId: resolvedSystemId || undefined });

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const currentStepLabel = runAllState.stepIndex > 0
    ? (REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label ?? null)
    : null;

  if (!resolvedSystemId) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Operations"
          description="Select a system from Design Systems Admin to view operations."
        />
        <StatusAlert
          variant="warning"
          title="No system selected"
          description="Navigate to Design Systems Admin and open Operations for a specific system."
        />
      </div>
    );
  }

  if (!systemExists) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Operations"
          description="Operations for the selected system."
        />
        <StatusAlert
          variant="error"
          title="System not found"
          description={`There is no design system with id "${resolvedSystemId}".`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-in fade-in duration-500">
      <PageHeader
        title="Operations"
        description="Centro de control para regenerar artefactos core y ejecutar diagnósticos puntuales."
        actions={
          <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
            <Button
              onClick={runAll}
              disabled={runAllState.isRunning || isRefreshing}
              variant={runAllState.failed ? "destructive" : "default"}
              size="sm"
              title={RUN_ALL_TOOLTIP}
            >
              {runAllState.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{currentStepLabel ?? "…"}</span>
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
                Error en "{currentStepLabel ?? "paso desconocido"}"
                {runAllState.errorCode ? ` · ${runAllState.errorCode}` : ""}
                {runAllState.errorMessage ? ` · ${runAllState.errorMessage}` : ""}
              </span>
            )}
          </div>
        }
      />

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

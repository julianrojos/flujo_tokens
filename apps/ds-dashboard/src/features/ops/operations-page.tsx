/**
 * Operations Page - orchestrator only.
 * Delegates all logic to hooks and section components.
 */

import { useEffect } from "react";
import { PageHeader } from "@/components/composites/page-header";
import { Button } from "@/components/ui/button";
import { Zap, Loader2 } from "lucide-react";
import { REFRESH_ALL_SEQUENCE, useRunAll } from "./hooks/use-run-all";
import { useOperationsArtifacts } from "./hooks/use-operations-artifacts";
import { useOperationsHistory } from "./hooks/use-operations-history";
import { OpsArtifactStatusGrid } from "./components/ops-artifact-status-grid";
import { OpsRecentOperationsSection } from "./components/ops-recent-operations-section";
import { OpsActionsSections } from "./components/ops-actions-sections";

const RUN_ALL_TOOLTIP = `Ejecuta en secuencia: ${REFRESH_ALL_SEQUENCE.map((step) => step.label).join(" → ")}`;

export function OperationsPage() {
  const { artifacts, isRefreshing, refreshStatuses } = useOperationsArtifacts();
  const {
    historyEvents,
    historyLoading,
    historyError,
    regressions,
    regressionsLoading,
    regressionsError,
    selectedHistoryEvent,
    selectedHistoryEventId,
    replayInFlightEventId,
    replayNotice,
    replayError,
    refreshOperationHistory,
    refreshOperationRegressions,
    setSelectedHistoryEventId,
    replaySelectedOperation,
  } = useOperationsHistory();

  const [runAllState, runAll] = useRunAll(() => {
    void refreshStatuses();
    void refreshOperationHistory();
    void refreshOperationRegressions();
  });

  useEffect(() => {
    void refreshStatuses();
    void refreshOperationHistory();
    void refreshOperationRegressions();
  }, [refreshStatuses, refreshOperationHistory, refreshOperationRegressions]);

  const currentStepLabel = runAllState.stepIndex > 0
    ? (REFRESH_ALL_SEQUENCE[runAllState.stepIndex - 1]?.label ?? null)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-in fade-in duration-500">
      <PageHeader
        title="Operations"
        description="Centro de control: regenera artefactos, ejecuta pipelines y sincroniza el sistema de diseño."
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
                  <span>Actualizar todo</span>
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

      <OpsRecentOperationsSection
        regressions={regressions}
        regressionsLoading={regressionsLoading}
        regressionsError={regressionsError}
        historyEvents={historyEvents}
        historyLoading={historyLoading}
        historyError={historyError}
        selectedHistoryEvent={selectedHistoryEvent}
        selectedHistoryEventId={selectedHistoryEventId}
        replayInFlightEventId={replayInFlightEventId}
        replayNotice={replayNotice}
        replayError={replayError}
        onRefreshRegressions={refreshOperationRegressions}
        onRefreshHistory={refreshOperationHistory}
        onSelectEvent={setSelectedHistoryEventId}
        onReplay={replaySelectedOperation}
      />

      <OpsActionsSections onRunSuccess={refreshStatuses} />
    </div>
  );
}

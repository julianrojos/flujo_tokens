/**
 * New System Page - orchestrator only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/composites";
import { ApiErrorMessage } from "@/components/api-error-message";
import { Modal, ModalContent } from "@/components/ui/overlay/modal";
import {
  ApiError,
  cancelQueueJob,
  syncFigmaTokens,
  syncConsumers,
  type CaptureFigmaErrorDetail,
  type TokensBootstrapResult,
  type TokensCompileResult,
} from "@/lib/api";
import { useNewSystemWizard } from "./hooks/use-new-system-wizard";
import { WizardStepBasics } from "./components/wizard-step-basics";
import { WizardStepImport } from "./components/wizard-step-import";
import {
  extractCaptureFigmaErrorDetail,
  formatCaptureFigmaErrorMessage,
} from "./new-system-import-errors";
import {
  getImportErrorHint,
  isCriticalTokensBootstrapFailure,
  toNonEmptyString,
  toRecord,
} from "./lib/new-system-transforms";
import {
  extractProofErrorContext,
  formatProofErrorMessage,
} from "./lib/new-system-proof-errors";

function toImportErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message || "Import failed";
  }
  if (error instanceof Error) {
    return error.message || "Import failed";
  }
  return String(error || "Import failed");
}

function toImportErrorDetails(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = toRecord(error.payload);
    if (payload) {
      return JSON.stringify(payload, null, 2);
    }
    return `${error.message}\nrequestId=${error.requestId || "n/a"}\ncode=${error.code}`;
  }
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function extractPipelinePhase(error: unknown): string {
  if (!(error instanceof ApiError)) return "";
  const payload = toRecord(error.payload);
  return toNonEmptyString(payload?.pipeline_phase);
}

export function NewSystemPage() {
  const startedImportKeyRef = useRef<string | null>(null);
  const activeQueueJobIdRef = useRef("");
  const [importRequestId, setImportRequestId] = useState("");
  const [importFigmaError, setImportFigmaError] = useState<CaptureFigmaErrorDetail | null>(null);
  const [importTokensBootstrap, setImportTokensBootstrap] = useState<TokensBootstrapResult | null>(null);
  const [importTokensCompile, setImportTokensCompile] = useState<TokensCompileResult | null>(null);
  const [resultImportMode, setResultImportMode] = useState<"full" | "partial" | null>(null);
  const [resultImportedCount, setResultImportedCount] = useState<number | null>(null);
  const [resultNotSelectedCount, setResultNotSelectedCount] = useState<number | null>(null);
  const [isCancellingQueueJob, setIsCancellingQueueJob] = useState(false);
  const {
    step,
    form,
    importState,
    scan,
    selectedComponentNodeIds,
    generatedSystemId,
    figmaFileId,
    isFormValid,
    canSelectAll,
    hasSelection,
    importCompleted,
    saving,
    saveError,
    showImportErrorDetails,
    isCancellingImport,
    setFormField,
    handleScan,
    handleImportDesignSystem,
    toggleComponent,
    selectAll,
    deselectAll,
    cancelImport,
    resetWizard,
    toggleImportErrorDetails,
    updateImportProgress,
    completeImport,
    failImport,
  } = useNewSystemWizard();

  const modalOpen = step === "importing" || step === "done";
  const progressTotal = importState.progress?.total ?? 0;
  const progressCompleted = importState.progress?.completed ?? 0;
  const progressRemaining =
    importState.progress?.remaining ?? Math.max(0, progressTotal - progressCompleted);
  const importStatusText = useMemo(() => {
    if (isCancellingImport) return "Stopping import...";
    if (importState.error) return "Import failed.";
    if (importCompleted) return "Import completed successfully.";
    if (!importState.progress) return "Preparing import...";
    if (importState.progress.status === "queued") {
      return "Queued in backend. Waiting for worker assignment...";
    }
    if (importState.progress.status === "running") {
      if (progressTotal > 0) {
        return `${progressCompleted}/${progressTotal} downloaded · ${progressRemaining} remaining`;
      }
      return "Running import. Waiting for first progress event...";
    }
    if (importState.progress.status === "cancelled") return "Import was cancelled.";
    if (importState.progress.status === "error") return "Import failed.";
    return "Import completed successfully.";
  }, [
    importCompleted,
    importState.error,
    importState.progress,
    isCancellingImport,
    progressCompleted,
    progressRemaining,
    progressTotal,
  ]);
  const importErrorHint = importState.error
    ? getImportErrorHint(importState.error, importFigmaError, importState.pipelinePhase)
    : null;
  const bootstrapHasCriticalFailure = isCriticalTokensBootstrapFailure(importTokensBootstrap);
  const canShowTokensLink =
    importCompleted &&
    !importState.error &&
    !bootstrapHasCriticalFailure &&
    (!importTokensCompile || importTokensCompile.compiled === true);
  const effectiveIsCancelling = isCancellingImport || isCancellingQueueJob;

  const cancelActiveQueueJob = useCallback(async () => {
    const queueJobId = activeQueueJobIdRef.current.trim();
    if (!queueJobId) return;
    activeQueueJobIdRef.current = "";
    try {
      await cancelQueueJob(queueJobId);
    } catch {
      // best-effort cancellation only
    }
  }, []);

  const handleCancelImport = useCallback(() => {
    if (isCancellingQueueJob) return;
    setIsCancellingQueueJob(true);
    void (async () => {
      try {
        await cancelActiveQueueJob();
      } finally {
        cancelImport();
        setIsCancellingQueueJob(false);
      }
    })();
  }, [cancelActiveQueueJob, cancelImport, isCancellingQueueJob]);

  useEffect(() => {
    if (step !== "importing") {
      startedImportKeyRef.current = null;
      activeQueueJobIdRef.current = "";
      setIsCancellingQueueJob(false);
      setResultImportMode(null);
      setResultImportedCount(null);
      setResultNotSelectedCount(null);
    }
  }, [step]);

  useEffect(() => {
    if (step !== "importing") return;
    const sourceUrl = importState.sourceUrl.trim();
    const systemId = importState.jobId.trim();
    if (!sourceUrl || !systemId) return;

    const runKey = `${systemId}|${sourceUrl}`;
    if (startedImportKeyRef.current === runKey) return;
    startedImportKeyRef.current = runKey;

    let stopped = false;
    activeQueueJobIdRef.current = "";
    setImportRequestId("");
    setImportFigmaError(null);
    setImportTokensBootstrap(null);
    setImportTokensCompile(null);
    setResultImportMode(null);
    setResultImportedCount(null);
    setResultNotSelectedCount(null);
    void (async () => {
      try {
        const result = await syncFigmaTokens(
          {
            url: sourceUrl,
            tokensSource: "mcp",
            includeComponents: true,
            dryRun: false,
            figmaToken: form.figmaAccessToken.trim() || undefined,
            selectedComponentNodeIds: importState.importMode === "partial"
              ? importState.selectedComponentNodeIds
              : undefined,
            requireComponentProofs: true,
            // Variant screenshots are best-effort; only main component proofs are required.
            requireVariantProofsWhenPresent: false,
          },
          {
            systemId,
            onProgress: (progress) => {
              if (stopped) return;
              if (typeof progress.jobId === "string" && progress.jobId.trim()) {
                activeQueueJobIdRef.current = progress.jobId.trim();
              }
              updateImportProgress(progress);
            },
          },
        );
        if (stopped) return;
        activeQueueJobIdRef.current = "";
        setImportTokensBootstrap(null);
        setImportTokensCompile(null);

        const importedComponents = Math.max(0, Number(result.components || 0));
        const importedTokens = Math.max(0, Number(result.tokens || 0));
        const importedNotSelectedCount =
          typeof result.notSelectedCount === "number"
            ? Math.max(0, result.notSelectedCount)
            : importState.importMode === "partial"
              ? Math.max(0, (importState.selectedCount + importState.notSelectedCount) - importedComponents)
              : 0;
        setResultImportMode(result.importMode || null);
        setResultImportedCount(importedComponents);
        setResultNotSelectedCount(importedNotSelectedCount);
        if (result.componentsTruncated) {
          console.warn('[NewSystemPage] Component list truncated during sync; reconciliation may be partial.');
        }
        if (stopped) return;
        const sourceFileKey = importState.sourceFileKey;
        if (sourceFileKey) {
          if (stopped) return;
          await syncConsumers({
            dsFileKey: sourceFileKey,
            force: true,
            captureParentUsage: true,
          }).catch((err) => {
            // Log warning but don't block import success
            console.warn('[NewSystemPage] Parent usage capture failed:', err);
          });
        }

        if (stopped) return;
        completeImport({
          elementsImported: importedComponents,
          elementsTotal: importedComponents,
          collectionsImported: null,
          collectionsTotal: null,
          variablesImported: importedTokens,
          variablesTotal: importedTokens,
          tokensCompiled: null,
          compileReason: null,
        });
      } catch (error) {
        if (stopped) return;
        activeQueueJobIdRef.current = "";
        const proofContext = extractProofErrorContext(error);
        const proofMessage = proofContext ? formatProofErrorMessage(proofContext) : null;
        if (error instanceof ApiError) {
          setImportRequestId(error.requestId || "");
          setImportFigmaError(extractCaptureFigmaErrorDetail(error.payload));
        }
        failImport(
          proofMessage || formatCaptureFigmaErrorMessage(
            error instanceof ApiError ? extractCaptureFigmaErrorDetail(error.payload) : null,
          ) || toImportErrorMessage(error),
          toImportErrorDetails(error),
          extractPipelinePhase(error),
        );
      }
    })();

    return () => {
      stopped = true;
      void cancelActiveQueueJob();
    };
  }, [
    cancelActiveQueueJob,
    completeImport,
    failImport,
    form.figmaAccessToken,
    importState.jobId,
    importState.sourceFileKey,
    importState.sourceUrl,
    importState.selectedComponentNodeIds,
    step,
    updateImportProgress,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Create Design System"
        description="Import from Figma"
      />

      {saveError && <ApiErrorMessage error={saveError} />}

      {step === "basics" && (
        <WizardStepBasics
          form={form}
          derived={{
            generatedSystemId,
            figmaFileId,
            isFormValid,
            saving,
            scanState: scan.state,
            scanComponents: scan.components,
            scanTruncated: scan.truncated,
            scanTotal: scan.total,
            scanLimit: scan.limit,
            scanError: scan.error,
            selectedIds: selectedComponentNodeIds,
            canSelectAll,
            hasSelection,
          }}
          actions={{
            onFieldChange: setFormField,
            onScan: handleScan,
            onImport: handleImportDesignSystem,
            onToggleComponent: toggleComponent,
            onSelectAll: selectAll,
            onDeselectAll: deselectAll,
          }}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => undefined}
      >
        <ModalContent size="md">
          <WizardStepImport
            progress={importState.progress}
            error={importState.error}
            errorDetails={importState.errorDetails}
            pipelinePhase={importState.pipelinePhase}
            sourceUrl={importState.sourceUrl}
            sourceFileKey={importState.sourceFileKey}
            requestId={importRequestId}
            figmaError={importFigmaError}
            errorHint={importErrorHint}
            tokensBootstrap={importTokensBootstrap}
            tokensCompile={importTokensCompile}
            successSummary={importState.successSummary}
            importMode={resultImportMode || importState.importMode}
            importedCount={resultImportedCount ?? importState.selectedCount}
            notSelectedCount={resultNotSelectedCount ?? importState.notSelectedCount}
            showTokensLink={canShowTokensLink}
            statusText={importStatusText}
            showDetails={showImportErrorDetails}
            isCancelling={effectiveIsCancelling}
            importCompleted={importCompleted}
            onCancel={handleCancelImport}
            onClose={resetWizard}
            onReset={resetWizard}
            onToggleDetails={toggleImportErrorDetails}
          />
        </ModalContent>
      </Modal>
    </div>
  );
}

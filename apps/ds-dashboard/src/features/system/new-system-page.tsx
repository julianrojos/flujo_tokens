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
  captureFigmaScreenshot,
  syncConsumers,
  type CaptureFigmaScreenshotArgs,
  type CaptureFigmaErrorDetail,
  type CaptureFigmaScreenshotResult,
  type TokensBootstrapResult,
  type TokensCompileResult,
} from "@/lib/api";
import { buildImportSuccessSummary } from "./new-system-import-summary";
import { useNewSystemWizard } from "./hooks/use-new-system-wizard";
import { WizardStepBasics } from "./components/wizard-step-basics";
import { WizardStepImport } from "./components/wizard-step-import";
import {
  extractCaptureFigmaErrorDetail,
  formatCaptureFigmaErrorMessage,
} from "./new-system-import-errors";
import {
  getImportErrorHint,
  hasNoCaptureTargets,
  isCriticalTokensBootstrapFailure,
  toNonEmptyString,
  toRecord,
} from "./lib/new-system-transforms";

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

function ensureImportSuccess(result: CaptureFigmaScreenshotResult): CaptureFigmaScreenshotResult {
  if (result.ok) return result;
  const message =
    toNonEmptyString(result.error) ||
    toNonEmptyString(result.message) ||
    toNonEmptyString(result.stderr) ||
    "Import failed";
  throw new Error(message);
}

export function NewSystemPage() {
  const startedImportKeyRef = useRef<string | null>(null);
  const activeQueueJobIdRef = useRef("");
  const [importRequestId, setImportRequestId] = useState("");
  const [importFigmaError, setImportFigmaError] = useState<CaptureFigmaErrorDetail | null>(null);
  const [importTokensBootstrap, setImportTokensBootstrap] = useState<TokensBootstrapResult | null>(null);
  const [importTokensCompile, setImportTokensCompile] = useState<TokensCompileResult | null>(null);
  const [isCancellingQueueJob, setIsCancellingQueueJob] = useState(false);
  const {
    step,
    form,
    importState,
    generatedSystemId,
    figmaFileId,
    isFormValid,
    importCompleted,
    saving,
    saveError,
    showImportErrorDetails,
    isCancellingImport,
    setFormField,
    handleSubmitBasics,
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
    void (async () => {
      try {
        const baseRequest: CaptureFigmaScreenshotArgs = {
          figmaUrl: sourceUrl,
          figmaToken: form.figmaAccessToken.trim() || undefined,
          tokensSource: "mcp",
          includeVariants: true,
          requireExistingDoc: false,
          continueOnError: true,
          refreshIndices: true,
          injectDocSpecs: true,
          componentKind: "component_set",
        };
        let request = { ...baseRequest };

        const preview = await captureFigmaScreenshot(
          {
            ...request,
            dryRun: true,
            refreshIndices: false,
          },
          { systemId },
        );

        if (hasNoCaptureTargets(preview)) {
          request = { ...baseRequest, componentKind: "component" };
        }

        const result = await captureFigmaScreenshot(request, {
          systemId,
          onProgress: (progress) => {
            if (stopped) return;
            if (typeof progress.jobId === "string" && progress.jobId.trim()) {
              activeQueueJobIdRef.current = progress.jobId.trim();
            }
            updateImportProgress(progress);
          },
        });
        if (stopped) return;
        activeQueueJobIdRef.current = "";
        setImportTokensBootstrap(result.tokens_bootstrap || null);
        setImportTokensCompile(result.tokens_compile || null);
        const success = ensureImportSuccess(result);
        const sourceFileKey = importState.sourceFileKey;
        // Persist parent-file variable usage snapshot in DB using the same import context.
        if (sourceFileKey) {
          await syncConsumers({
            dsFileKey: sourceFileKey,
            force: true,
            captureParentUsage: true,
          }).catch((err) => {
            // Log warning but don't block import success
            console.warn('[NewSystemPage] Parent usage capture failed:', err);
          });
        }
        completeImport(buildImportSuccessSummary(success));
      } catch (error) {
        if (stopped) return;
        activeQueueJobIdRef.current = "";
        if (error instanceof ApiError) {
          setImportRequestId(error.requestId || "");
          setImportFigmaError(extractCaptureFigmaErrorDetail(error.payload));
        }
        failImport(
          formatCaptureFigmaErrorMessage(
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
          }}
          actions={{
            onFieldChange: setFormField,
            onSubmit: handleSubmitBasics,
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

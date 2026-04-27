/**
 * Wizard Step Import - progress, logs, errors, cancel.
 */

import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  ModalCloseButton,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/overlay";
import type {
  CaptureFigmaErrorDetail,
  CaptureFigmaProgress,
} from "@/lib/api";
import type { ImportSuccessSummary } from "../new-system-import-summary";
import { ImportSuccessNotice } from "../import-success-notice";
import { cn } from "@/lib/utils";
import { toSystemOverview } from "@/lib/routes";

interface WizardStepImportProps {
  progress: CaptureFigmaProgress | null;
  error: string | null;
  errorDetails: string;
  pipelinePhase: string;
  sourceUrl?: string;
  sourceFileKey?: string;
  requestId?: string;
  figmaError?: CaptureFigmaErrorDetail | null;
  errorHint?: string | null;
  successSummary?: ImportSuccessSummary | null;
  importMode?: "full" | "partial";
  importedCount?: number;
  notSelectedCount?: number;
  showTokensLink?: boolean;
  systemId?: string;
  statusText?: string;
  showDetails: boolean;
  isCancelling: boolean;
  importCompleted: boolean;
  onCancel: () => void;
  onClose: () => void;
  onReset: () => void;
  onToggleDetails: () => void;
}

export function WizardStepImport({
  progress,
  error,
  errorDetails,
  pipelinePhase,
  sourceUrl,
  sourceFileKey,
  requestId,
  figmaError,
  errorHint,
  successSummary,
  importMode,
  importedCount,
  notSelectedCount,
  showTokensLink = true,
  systemId,
  statusText,
  showDetails,
  isCancelling,
  importCompleted,
  onCancel,
  onClose,
  onReset,
  onToggleDetails,
}: WizardStepImportProps) {
  const componentsTotal = successSummary?.elementsTotal ?? progress?.total ?? null;
  const componentsTotalLabel =
    componentsTotal !== null
      ? successSummary?.elementsTotalIsLowerBound
        ? `>= ${componentsTotal}`
        : `${componentsTotal}`
      : "—";
  const componentsImported = successSummary?.elementsImported ?? progress?.completed ?? null;
  const figmaVariablesTotal = successSummary?.variablesTotal ?? null;
  const importedVariables = successSummary?.variablesImported ?? null;
  const showComponentsStats = componentsTotal !== null || componentsImported !== null;
  const showVariableStats = figmaVariablesTotal !== null || importedVariables !== null;
  const hasRealProgressData =
    (progress?.total ?? 0) > 0 ||
    (progress?.completed ?? 0) > 0;
  const showStatsWhileImporting =
    (showComponentsStats || showVariableStats) && hasRealProgressData;
  const progressSummary = (() => {
    if (!progress) return statusText || "Preparing import...";
    if (progress.status === "queued") {
      return progress.message || "Queued in backend. Waiting for worker assignment...";
    }
    if (progress.status === "running") {
      if (progress.total > 0) {
        return `${progress.completed} / ${progress.total} items`;
      }
      return progress.message || statusText || "Running import. Waiting for first progress event...";
    }
    if (progress.status === "cancelled") {
      return progress.message || "Import was cancelled.";
    }
    if (progress.status === "error") {
      return progress.message || "Import failed.";
    }
    if (progress.total > 0) {
      return `${progress.completed} / ${progress.total} items`;
    }
    return progress.message || statusText || "Import completed successfully.";
  })();

  const renderImportStats = () => (
    <div className="rounded border border-border/70 bg-muted/30 p-3 text-sm">
      <p className="font-medium">Import summary</p>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {showComponentsStats ? (
          <>
            <span>
              Components imported: <strong className="text-foreground">{componentsImported ?? "—"}</strong>
            </span>
            <span>
              Components total: <strong className="text-foreground">{componentsTotalLabel}</strong>
            </span>
          </>
        ) : null}
        {showVariableStats ? (
          <>
            <span>
              Variables imported: <strong className="text-foreground">{importedVariables ?? "—"}</strong>
            </span>
            <span>
              Variables total: <strong className="text-foreground">{figmaVariablesTotal ?? "—"}</strong>
            </span>
          </>
        ) : null}
      </div>
    </div>
  );

  if (importCompleted) {
    const safeSystemId = String(systemId || "").trim();
    const overviewHref = safeSystemId ? toSystemOverview(safeSystemId) : "";
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader>
          <div>
            <h3 className="text-base font-titles font-semibold titles-color">
              Import Complete
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {importMode === "partial"
                ? `Partial import: ${importedCount ?? 0} of ${(importedCount ?? 0) + (notSelectedCount ?? 0)} components imported`
                : "Your design system has been created"}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} label="Close import dialog" />
        </ModalHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {(showComponentsStats || showVariableStats) ? renderImportStats() : null}
          {successSummary ? <ImportSuccessNotice summary={successSummary} /> : null}
          <StatusAlert
            variant="info"
            title="Next steps"
            description="Your design system import has finished. You can now review the system overview, inspect tokens, or explore imported components."
          />
        </div>

        <ModalFooter className="justify-end">
          {overviewHref ? (
            <Link to={overviewHref} className={cn(buttonVariants({ variant: "default" }))}>
              Go to System overview
            </Link>
          ) : null}
          {showTokensLink ? (
            <Link to="/tokens" className={cn(buttonVariants({ variant: "outline" }))}>
              View tokens
            </Link>
          ) : null}
          <Link to="/components" className={cn(buttonVariants({ variant: "outline" }))}>
            View components
          </Link>
        </ModalFooter>
      </div>
    );
  }

  return (
      <Card>
        <CardHeader>
          <CardTitle>Importing from Figma</CardTitle>
          <CardDescription>{statusText || "Syncing components and tokens"}</CardDescription>
        </CardHeader>
      <CardContent className="space-y-4">
        {showStatsWhileImporting ? renderImportStats() : null}
        {sourceUrl ? (
          <p className="break-all text-xs text-muted-foreground">
            Source URL: <code>{sourceUrl}</code>
          </p>
        ) : null}
        {sourceFileKey ? (
          <p className="text-xs text-muted-foreground">
            File key: <code>{sourceFileKey}</code>
          </p>
        ) : null}
        {requestId ? (
          <p className="text-xs text-muted-foreground">
            Request ID: <code>{requestId}</code>
          </p>
        ) : null}

        <div className="space-y-1" aria-live="polite" aria-atomic="true">
          <div className="text-sm">
            <span className="font-medium">
              {progress && progress.total > 0 ? "Progress:" : "Status:"}
            </span>{" "}
            {progressSummary}
          </div>
          {progress?.currentSlug ? (
            <div className="text-xs text-muted-foreground">
              Current: {progress.currentSlug}
            </div>
          ) : null}
        </div>

        {error ? (
          <>
            <StatusAlert variant="error" title="Import failed">
              {error}
              {pipelinePhase && <p className="mt-1 text-xs">Phase: {pipelinePhase}</p>}
            </StatusAlert>
            {figmaError ? (
              <StatusAlert
                variant="warning"
                title="Figma API details"
                description={
                  <>
                    {typeof figmaError.status === "number" ? (
                      <p>Status: <code>{figmaError.status}</code></p>
                    ) : null}
                    {figmaError.fileKey ? (
                      <p>File key: <code>{figmaError.fileKey}</code></p>
                    ) : null}
                    {figmaError.endpoint ? (
                      <p className="break-all">Endpoint: <code>{figmaError.endpoint}</code></p>
                    ) : null}
                  </>
                }
              />
            ) : null}
            {errorHint ? (
              <StatusAlert variant="info" title="Suggested action" description={errorHint} />
            ) : null}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onToggleDetails}>
                {showDetails ? "Hide" : "Show"} details
              </Button>
              <Button variant="outline" size="sm" onClick={onReset} disabled={isCancelling}>
                {isCancelling ? "Cancelling…" : "Start over"}
              </Button>
            </div>
            {showDetails && errorDetails && (
              <pre className="max-h-64 overflow-auto rounded border border-border bg-muted p-3 text-xs">
                {errorDetails}
              </pre>
            )}
          </>
        ) : (
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isCancelling}>
              {isCancelling ? "Cancelling…" : "Cancel import"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

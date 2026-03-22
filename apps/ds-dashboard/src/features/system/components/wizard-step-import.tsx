/**
 * Wizard Step Import - progress, logs, errors, cancel.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import type { CaptureFigmaProgress } from "@/lib/api";

interface WizardStepImportProps {
  progress: CaptureFigmaProgress | null;
  error: string | null;
  errorDetails: string;
  pipelinePhase: string;
  showDetails: boolean;
  isCancelling: boolean;
  importCompleted: boolean;
  onCancel: () => void;
  onReset: () => void;
  onToggleDetails: () => void;
}

export function WizardStepImport({
  progress,
  error,
  errorDetails,
  pipelinePhase,
  showDetails,
  isCancelling,
  importCompleted,
  onCancel,
  onReset,
  onToggleDetails,
}: WizardStepImportProps) {
  if (importCompleted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Complete</CardTitle>
          <CardDescription>Your design system has been created</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onReset}>Create another system</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importing from Figma</CardTitle>
        <CardDescription>Capturing components and tokens</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress ? (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Progress:</span> {progress.completed} / {progress.total} components
            </div>
            {progress.currentSlug && (
              <div className="text-xs text-muted-foreground">
                Current: {progress.currentSlug}
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <>
            <StatusAlert variant="error" title="Import failed">
              {error}
              {pipelinePhase && <p className="mt-1 text-xs">Phase: {pipelinePhase}</p>}
            </StatusAlert>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onToggleDetails}>
                {showDetails ? "Hide" : "Show"} details
              </Button>
              <Button variant="outline" size="sm" onClick={onReset} disabled={isCancelling}>
                {isCancelling ? "Cancelling…" : "Start over"}
              </Button>
            </div>
            {showDetails && errorDetails && (
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">
                {errorDetails}
              </pre>
            )}
          </>
        ) : (
          <Button variant="outline" onClick={onCancel} disabled={isCancelling}>
            {isCancelling ? "Cancelling…" : "Cancel import"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";

import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusAlert } from "@/components/ui/status-alert";
import { useOperationRunner } from "@/hooks/use-operation-runner";
import { LogTerminal } from "@/components/composites/log-terminal";
import type { FigmaMcpDesignContextCompactResponse } from "@/lib/api";
import {
  buildUpdateComponentsPayload,
  buildUpdateVariablesPayload,
  resolveUpdateButtonLabel,
} from "@/features/system/design-system-update-actions-logic";

function toSuggestedFigmaUrl(figmaFileId: string | null | undefined): string {
  const trimmed = String(figmaFileId || "").trim();
  if (!trimmed) return "";
  return `https://www.figma.com/design/${encodeURIComponent(trimmed)}`;
}

interface DesignSystemUpdateActionsProps {
  systemId: string;
  figmaFileId?: string;
  disabled?: boolean;
  onRunSuccess?: () => void;
}

export function DesignSystemUpdateActions({
  systemId,
  figmaFileId,
  disabled = false,
  onRunSuccess,
}: DesignSystemUpdateActionsProps) {
  const suggestedUrl = useMemo(() => toSuggestedFigmaUrl(figmaFileId), [figmaFileId]);

  const [sharedFigmaUrl, setSharedFigmaUrl] = useState(suggestedUrl);
  const [sharedToken, setSharedToken] = useState("");
  const [autoTriggerToken, setAutoTriggerToken] = useState(0);
  const [componentsValidationError, setComponentsValidationError] = useState<string | null>(null);
  const [designContext, setDesignContext] = useState<FigmaMcpDesignContextCompactResponse | null>(null);
  const [allowVariablesWithContextIssues, setAllowVariablesWithContextIssues] = useState(false);

  const [componentsState, componentsActions] = useOperationRunner(
    `ds-admin-components-${systemId}`,
    "/api/capture-figma-screenshot",
    onRunSuccess,
    { systemId },
  );
  const [variablesState, variablesActions] = useOperationRunner(
    `ds-admin-variables-${systemId}`,
    "/api/sync-figma-tokens",
    onRunSuccess,
    { systemId },
  );

  useEffect(() => {
    if (!suggestedUrl) return;
    setSharedFigmaUrl((current) => (String(current || "").trim() ? current : suggestedUrl));
  }, [suggestedUrl]);

  const handleDesignContextChange = useCallback((payload: FigmaMcpDesignContextCompactResponse | null) => {
    setDesignContext(payload);
    setAllowVariablesWithContextIssues(false);
  }, []);

  const handleUpdateComponents = useCallback(async () => {
    const built = buildUpdateComponentsPayload({
      figmaUrl: sharedFigmaUrl,
      figmaToken: sharedToken,
    });
    if (!built.ok) {
      setComponentsValidationError(built.error);
      return;
    }
    setComponentsValidationError(null);
    await componentsActions.run(built.payload);
  }, [componentsActions, sharedFigmaUrl, sharedToken]);

  const handleUpdateVariables = useCallback(async () => {
    const payload = buildUpdateVariablesPayload({
      figmaUrl: sharedFigmaUrl,
      figmaToken: sharedToken,
    });
    await variablesActions.run(payload);
  }, [variablesActions, sharedFigmaUrl, sharedToken]);

  const variablesContextMissingCount =
    designContext?.ok === true ? Number(designContext.tokens?.missingCount || 0) : 0;
  const variablesContextModeFallbackCount =
    designContext?.ok === true ? Number(designContext.tokens?.modeFallbackCount || 0) : 0;
  const hasBlockingVariablesContextIssue = variablesContextMissingCount > 0;
  const canRunVariablesUpdate =
    !disabled &&
    !variablesState.isRunning &&
    (!hasBlockingVariablesContextIssue || allowVariablesWithContextIssues);

  return (
    <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Update from Figma</h3>
        <p className="text-xs text-muted-foreground">
          Run updates for this system without leaving admin.
        </p>
      </div>

      <div className="mb-3 rounded-md border border-border bg-card p-3">
        <h4 className="text-sm font-semibold">Shared Figma settings</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          These fields are shared by both update actions below.
        </p>
        <div className="mt-3 space-y-2">
          <div className="min-w-0 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Figma URL</label>
            <Input
              value={sharedFigmaUrl}
              onChange={(event) => setSharedFigmaUrl(event.target.value)}
              placeholder="https://www.figma.com/design/…"
              disabled={disabled || componentsState.isRunning || variablesState.isRunning}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Figma token override
            </label>
            <Input
              type="password"
              value={sharedToken}
              onChange={(event) => setSharedToken(event.target.value)}
              placeholder="Figma token (optional)"
              autoComplete="off"
              disabled={disabled || componentsState.isRunning || variablesState.isRunning}
              onBlur={() => {
                if (sharedFigmaUrl.trim() && sharedToken.trim()) {
                  setAutoTriggerToken((n) => n + 1);
                }
              }}
            />
            <FigmaMcpConnectionTestButton
              figmaUrl={sharedFigmaUrl}
              figmaToken={sharedToken}
              autoTriggerToken={autoTriggerToken}
              className="w-full"
              disabled={disabled || componentsState.isRunning || variablesState.isRunning}
              showDesignContextCompact
              onDesignContextCompactChange={handleDesignContextChange}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-3">
          <h4 className="text-sm font-semibold">Update components</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Re-capture component specs and docs from a Figma URL.
          </p>

          <div className="mt-3 space-y-2">
            {componentsValidationError ? (
              <p className="text-xs text-status-error">{componentsValidationError}</p>
            ) : null}
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => void handleUpdateComponents()}
                disabled={disabled || componentsState.isRunning}
              >
                {resolveUpdateButtonLabel({
                  type: "components",
                  isRunning: componentsState.isRunning,
                })}
              </Button>
            </div>
          </div>

          <LogTerminal
            className="mt-3 rounded-md border border-border/70"
            logLines={componentsState.logLines}
            summary={componentsState.summary}
            status={componentsState.status}
            elapsedMs={componentsState.elapsedMs}
            onClear={componentsActions.clearLogs}
          />
        </section>

        <section className="rounded-md border border-border bg-card p-3">
          <h4 className="text-sm font-semibold">Update Figma variables</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Sync variables (and optional components) from the plugin into the database.
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => void handleUpdateVariables()}
                disabled={!canRunVariablesUpdate}
              >
                {resolveUpdateButtonLabel({
                  type: "variables",
                  isRunning: variablesState.isRunning,
                })}
              </Button>
            </div>
            {hasBlockingVariablesContextIssue ? (
              <StatusAlert
                variant="error"
                description={
                  <>
                    <p>
                      Current selection has {variablesContextMissingCount} token bindings without a resolved variable.
                    </p>
                    <label className="mt-1 inline-flex items-center gap-1.5 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={allowVariablesWithContextIssues}
                        onChange={(event) => setAllowVariablesWithContextIssues(event.target.checked)}
                        disabled={disabled || variablesState.isRunning}
                        className="h-3.5 w-3.5"
                      />
                      Continue anyway
                    </label>
                  </>
                }
              />
            ) : variablesContextModeFallbackCount > 0 ? (
              <p className="text-[11px] text-status-warning">
                Current selection includes {variablesContextModeFallbackCount} variables using mode fallback.
              </p>
            ) : null}
          </div>

          <LogTerminal
            className="mt-3 rounded-md border border-border/70"
            logLines={variablesState.logLines}
            summary={variablesState.summary}
            status={variablesState.status}
            elapsedMs={variablesState.elapsedMs}
            onClear={variablesActions.clearLogs}
          />
        </section>
      </div>
    </div>
  );
}

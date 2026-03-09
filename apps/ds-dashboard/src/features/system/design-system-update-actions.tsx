import { useCallback, useEffect, useMemo, useState } from "react";

import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperationRunner } from "@/features/ops/hooks/use-operation-runner";
import { LogTerminal } from "@/features/ops/components/log-terminal";
import {
  buildUpdateComponentsPayload,
  buildUpdateVariablesPayload,
  resolveUpdateButtonLabel,
  type TokensSource,
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
  const [componentsValidationError, setComponentsValidationError] = useState<string | null>(null);

  const [tokensSource, setTokensSource] = useState<TokensSource>("auto");

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
      tokensSource,
    });
    await variablesActions.run(payload);
  }, [tokensSource, variablesActions, sharedFigmaUrl, sharedToken]);

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
        <div className="mt-3 grid gap-2 md:grid-cols-2 md:items-end">
          <div className="min-w-0 space-y-1 md:col-span-2">
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
            />
          </div>
          <div className="min-w-0 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">MCP connection</span>
            <FigmaMcpConnectionTestButton
              figmaUrl={sharedFigmaUrl}
              figmaToken={sharedToken}
              className="min-w-0"
              disabled={disabled || componentsState.isRunning || variablesState.isRunning}
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
              <p className="text-xs text-red-600 dark:text-red-400">{componentsValidationError}</p>
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
            Download variables and compile CSS custom properties for this system.
          </p>

          <div className="mt-3 space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Token source</label>
              <select
                value={tokensSource}
                onChange={(event) =>
                  setTokensSource(event.target.value as "auto" | "mcp" | "rest")
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                disabled={disabled || variablesState.isRunning}
              >
                <option value="auto">auto</option>
                <option value="mcp">mcp</option>
                <option value="rest">rest</option>
              </select>
            </div>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => void handleUpdateVariables()}
                disabled={disabled || variablesState.isRunning}
              >
                {resolveUpdateButtonLabel({
                  type: "variables",
                  isRunning: variablesState.isRunning,
                })}
              </Button>
            </div>
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

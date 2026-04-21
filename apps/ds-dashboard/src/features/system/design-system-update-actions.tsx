import { useCallback, useEffect, useMemo, useState } from "react";

import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperationRunner } from "@/hooks/use-operation-runner";
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
      return;
    }
    await componentsActions.run(built.payload);
  }, [componentsActions, sharedFigmaUrl, sharedToken]);

  const handleUpdateVariables = useCallback(async () => {
    const payload = buildUpdateVariablesPayload({
      figmaUrl: sharedFigmaUrl,
      figmaToken: sharedToken,
    });
    await variablesActions.run(payload);
  }, [variablesActions, sharedFigmaUrl, sharedToken]);

  const canRunVariablesUpdate = !disabled && !variablesState.isRunning;

  return (
    <div className="mt-3 py-3">
      <div className="mb-3">
        <h3 className="text-base font-titles font-semibold titles-color">Update from Figma</h3>
      </div>

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
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-end gap-2">
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
      </div>
    </div>
  );
}

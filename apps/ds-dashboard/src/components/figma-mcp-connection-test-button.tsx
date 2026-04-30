import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay';
import type { FigmaMcpDesignContextCompactResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  useFigmaMcpConnectionTest,
  type UseFigmaMcpConnectionTestProps,
} from '@/hooks/use-figma-mcp-connection-test';

const RECOVERY_STEPS = [
  'Refresh DS Graph status',
  'Wait for reconnection',
  'Reopen DS Graph plugin in Figma',
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FigmaMcpConnectionTestButtonProps extends UseFigmaMcpConnectionTestProps {
  className?: string;
  buttonLabel?: string;
  size?: 'default' | 'sm';
  showDetectedCounts?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FigmaMcpConnectionTestButton({
  className,
  buttonLabel = 'Test connection',
  size = 'sm',
  showDetectedCounts = true,
  ...hookProps
}: FigmaMcpConnectionTestButtonProps) {
  const {
    isLoading,
    isLoadingContext,
    isResetting,
    isWaiting,
    result,
    contextResult,
    isResolveModalOpen,
    resolveConfirmed,
    connectionHealth,
    canResolve,
    isRecoveryActive,
    showRecoveryStepper,
    activeRecoveryStep,
    resetSecondsLeft,
    waitSecondsLeft,
    isNotConnected,
    isPluginVersionMismatch,
    contextTokens,
    aliasCount,
    apiHealthHref,
    handleTest,
    handleResolveConnection,
    fetchDesignContextCompact,
    openResolveModal,
    closeResolveModal,
    setResolveConfirmed,
  } = useFigmaMcpConnectionTest(hookProps);

  const { disabled = false, showDesignContextCompact = false } = hookProps;

  return (
    <div className={cn('min-w-0 w-full space-y-1', className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Action buttons                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4 flex w-full flex-wrap items-start justify-start gap-2">
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={() => void handleTest()}
          disabled={disabled || isLoading || isResetting}
        >
          {isLoading ? 'Testing MCP…' : buttonLabel}
        </Button>

        {canResolve && !isRecoveryActive ? (
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={openResolveModal}
            disabled={disabled || isLoading}
          >
            Resolve connection
          </Button>
        ) : null}

        {showDesignContextCompact ? (
          <Button
            type="button"
            variant="outline"
            size={size}
            onClick={() => void fetchDesignContextCompact()}
            disabled={
              disabled ||
              isLoading ||
              isResetting ||
              isWaiting ||
              isLoadingContext ||
              result?.connected !== true
            }
          >
            {isLoadingContext ? 'Inspecting selection…' : 'Inspect selection'}
          </Button>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Recovery stepper                                                     */}
      {/* ------------------------------------------------------------------ */}
      {showRecoveryStepper ? (
        <div className="space-y-1.5 rounded-md border border-status-warning-border/30 bg-status-warning-bg/5 p-2.5">
          <div className="space-y-1">
            {RECOVERY_STEPS.map((label, index) => {
              const isDone = activeRecoveryStep > index;
              const isActive = activeRecoveryStep === index;
              return (
                <div
                  key={label}
                  className={cn(
                    'flex items-center gap-2 text-[11px]',
                    isDone
                      ? 'text-status-success'
                      : isActive
                        ? 'text-status-warning'
                        : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold',
                      isDone
                        ? 'border-status-success/60 bg-status-success/20 text-status-success'
                        : isActive
                          ? 'border-status-warning/60 bg-status-warning/20 text-status-warning'
                          : 'border-muted-foreground/50',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>

          {isResetting ? (
            <p className="break-words text-[11px] text-status-warning">
              ↺ Refreshing DS Graph status… retrying in {resetSecondsLeft}s.
            </p>
          ) : isWaiting ? (
            <p className="break-words text-[11px] text-status-warning">
              ⏳ Retrying connection… {waitSecondsLeft}s left. Open the DS Graph plugin now.
            </p>
          ) : (
            <p className="break-words text-[11px] text-status-warning">
              ⚠ No reconnection detected. Open the DS Graph plugin and click
              &nbsp;&ldquo;Resolve connection&rdquo; again.
            </p>
          )}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Connection health summary                                            */}
      {/* ------------------------------------------------------------------ */}
      <p
        className={cn(
          'break-words text-[11px]',
          connectionHealth.tone === 'success'
            ? 'text-status-success'
            : connectionHealth.tone === 'warning'
              ? 'text-status-warning'
              : connectionHealth.tone === 'error'
                ? 'text-status-error'
                : 'text-muted-foreground',
        )}
      >
        {connectionHealth.text}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Test result detail                                                   */}
      {/* ------------------------------------------------------------------ */}
      {result && !showRecoveryStepper ? (
        result.ok && result.connected ? (
          <p className="break-words text-[11px] text-status-success">
            ✓ Connection successful
            {showDetectedCounts &&
            typeof result.collectionsDetected === 'number' &&
            typeof result.variablesDetected === 'number'
              ? ` — ${result.collectionsDetected} collections, ${result.variablesDetected} variables detected`
              : ''}
          </p>
        ) : isPluginVersionMismatch ? (
          <p className="break-words text-[11px] text-status-warning">
            ⚠ Plugin build mismatch. Reimport the DS Graph plugin so dashboard and plugin use the
            same protocol.
          </p>
        ) : isNotConnected ? (
          <p className="break-words text-[11px] text-status-warning">
            {result.everConnected ? (
              '⚠ Connection lost — reopen the DS Graph plugin to reconnect.'
            ) : (
              <>
                ⚠ No plugin heartbeat received yet. Make sure the dashboard is running with{' '}
                <code>npm run dashboard:dev</code>, then reload the DS Graph plugin, wait 5
                seconds, and try <strong>Test connection</strong> again. You can quickly verify
                backend health at{' '}
                <a
                  href={apiHealthHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2"
                >
                  /api/health ↗
                </a>{' '}
                (404 on / can be normal).
              </>
            )}
          </p>
        ) : (
          <p className="break-words text-[11px] text-status-error">
            ✗ Connection failed{result.message ? ` — ${result.message}` : ''}
          </p>
        )
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Design context compact                                               */}
      {/* ------------------------------------------------------------------ */}
      {showDesignContextCompact && (isLoadingContext || contextResult) ? (
        <DesignContextPanel
          isLoadingContext={isLoadingContext}
          contextResult={contextResult}
          contextTokens={contextTokens}
          aliasCount={aliasCount}
        />
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Heartbeat info — now provided by the unified context, so we read    */}
      {/* it from the hook return value via connectionHealth (no prop needed) */}
      {/* ------------------------------------------------------------------ */}

      {/* ------------------------------------------------------------------ */}
      {/* Resolve connection confirmation dialog                               */}
      {/* ------------------------------------------------------------------ */}
      <Modal open={isResolveModalOpen} onClose={closeResolveModal}>
        <ModalContent size="md">
          <ModalHeader>
            <div className="flex items-start justify-between gap-4">
              <h2
                id="figma-mcp-reset-confirm-title"
                className="text-lg font-titles font-semibold tracking-tight titles-color"
              >
                Resolve connection
              </h2>
              <ModalCloseButton
                onClick={closeResolveModal}
                label="Close resolve connection dialog"
              />
            </div>
          </ModalHeader>

          <div className="px-5 pb-2">
            <p className="mb-4 text-sm text-muted-foreground">
              This will refresh the plugin session state managed by this dashboard to force a
              clean reconnect.
            </p>
            <Checkbox
              id="figma-mcp-resolve-confirm"
              checked={resolveConfirmed}
              onChange={(e) => setResolveConfirmed(e.target.checked)}
              label="I understand the impact and want to continue"
              className="mb-5"
            />
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={closeResolveModal}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleResolveConnection()}
              disabled={!resolveConfirmed || disabled}
            >
              Resolve connection
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: design context panel (extracted for readability)
// ---------------------------------------------------------------------------

interface DesignContextPanelProps {
  isLoadingContext: boolean;
  contextResult: FigmaMcpDesignContextCompactResponse | null;
  contextTokens: Array<{ id: string; name: string; isAlias: boolean; modeId?: string | null }>;
  aliasCount: number;
}

function DesignContextPanel({
  isLoadingContext,
  contextResult,
  contextTokens,
  aliasCount,
}: DesignContextPanelProps) {
  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/25 p-2.5 text-[11px]">
      {isLoadingContext ? (
        <p className="text-muted-foreground">Inspecting current Figma selection…</p>
      ) : contextResult?.ok === true ? (
        <>
          <p className="font-medium text-foreground/90">
            Selection context
            {contextResult.targetNodeId ? ` · ${contextResult.targetNodeId}` : ''}
          </p>
          <p className="text-muted-foreground">
            {contextResult.selection?.count ?? 0} selected
            {contextResult.selection?.page ? ` · ${contextResult.selection.page}` : ''}
            {contextResult.component
              ? ` · ${contextResult.component.type} ${contextResult.component.name}`
              : contextResult.node
                ? ` · ${contextResult.node.type} ${contextResult.node.name}`
                : ''}
          </p>
          <p className="text-muted-foreground">
            Token bindings: {contextResult.tokens?.count ?? 0}
            {aliasCount > 0 ? ` · aliases ${aliasCount}` : ''}
            {(contextResult.tokens?.missingCount ?? 0) > 0
              ? ` · missing ${contextResult.tokens?.missingCount ?? 0}`
              : ''}
            {(contextResult.tokens?.modeFallbackCount ?? 0) > 0
              ? ` · mode fallback ${contextResult.tokens?.modeFallbackCount ?? 0}`
              : ''}
          </p>
          {contextTokens.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {contextTokens.slice(0, 6).map((token) => (
                <span
                  key={`${token.id}:${token.modeId ?? 'none'}`}
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono',
                    token.isAlias
                      ? 'border-status-warning/40 text-status-warning'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {token.name}
                </span>
              ))}
              {contextTokens.length > 6 ? (
                <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                  +{contextTokens.length - 6} more
                </span>
              ) : null}
            </div>
          ) : null}
          {Array.isArray(contextResult.warnings) && contextResult.warnings.length > 0 ? (
            <p className="text-status-warning">{contextResult.warnings[0]}</p>
          ) : null}
        </>
      ) : (
        <p className="text-status-error">
          Could not inspect selection
          {contextResult?.message ? ` — ${contextResult.message}` : ''}
        </p>
      )}
    </div>
  );
}

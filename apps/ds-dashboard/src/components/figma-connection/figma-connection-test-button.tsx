import { cn } from '@/lib/utils';
import {
  useFigmaMcpConnectionTest,
  type UseFigmaMcpConnectionTestProps,
} from '@/hooks/use-figma-mcp-connection-test';
import { FigmaConnectionActions } from './figma-connection-actions';
import { FigmaConnectionHealthSummary } from './figma-connection-health-summary';
import { FigmaConnectionRecoveryStepper } from './figma-connection-recovery-stepper';
import { FigmaConnectionResolveModal } from './figma-connection-resolve-modal';
import { FigmaConnectionResultDetail } from './figma-connection-result-detail';
import { FigmaConnectionDesignContextPanel } from './figma-connection-design-context-panel';

interface FigmaConnectionTestButtonProps extends UseFigmaMcpConnectionTestProps {
  className?: string;
  buttonLabel?: string;
  size?: 'default' | 'sm';
  showDetectedCounts?: boolean;
}

export function FigmaConnectionTestButton({
  className,
  buttonLabel = 'Test connection',
  size = 'sm',
  showDetectedCounts = true,
  ...hookProps
}: FigmaConnectionTestButtonProps) {
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
      <FigmaConnectionActions
        size={size}
        buttonLabel={buttonLabel}
        uiState={{
          disabled,
          isLoading,
          isResetting,
          isWaiting,
          isLoadingContext,
          canResolve,
          isRecoveryActive,
          showDesignContextCompact,
          isConnected: result?.connected === true,
        }}
        uiActions={{
          onTest: () => void handleTest(),
          onInspectSelection: () => void fetchDesignContextCompact(),
          onOpenResolveModal: openResolveModal,
        }}
      />

      <FigmaConnectionRecoveryStepper
        showRecoveryStepper={showRecoveryStepper}
        activeRecoveryStep={activeRecoveryStep}
        isResetting={isResetting}
        isWaiting={isWaiting}
        resetSecondsLeft={resetSecondsLeft}
        waitSecondsLeft={waitSecondsLeft}
      />

      <FigmaConnectionHealthSummary connectionHealth={connectionHealth} />

      <FigmaConnectionResultDetail
        result={result}
        showRecoveryStepper={showRecoveryStepper}
        showDetectedCounts={showDetectedCounts}
        isPluginVersionMismatch={isPluginVersionMismatch}
        isNotConnected={isNotConnected}
        apiHealthHref={apiHealthHref}
      />

      {showDesignContextCompact && (isLoadingContext || contextResult) ? (
        <FigmaConnectionDesignContextPanel
          contextState={{
            isLoadingContext,
            contextResult,
            contextTokens,
            aliasCount,
          }}
        />
      ) : null}

      <FigmaConnectionResolveModal
        dialogState={{
          open: isResolveModalOpen,
          disabled,
          resolveConfirmed,
        }}
        dialogActions={{
          onClose: closeResolveModal,
          onResolve: () => void handleResolveConnection(),
          onResolveConfirmedChange: setResolveConfirmed,
        }}
      />
    </div>
  );
}

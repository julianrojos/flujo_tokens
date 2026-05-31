import { cn } from '@/lib/utils';
import { ModalFooter } from '@/components/ui/overlay';
import {
  useFigmaMcpConnectionTest,
  type UseFigmaMcpConnectionTestProps,
} from '@/hooks/use-figma-mcp-connection-test';
import { useFigmaMcpStatus } from '@/lib/figma-mcp-status-context';
import { FigmaConnectionActions } from './figma-connection-actions';
import { FigmaConnectionHealthSummary } from './figma-connection-health-summary';
import { FigmaConnectionRecoveryStepper } from './figma-connection-recovery-stepper';
import { FigmaConnectionResolveModal } from './figma-connection-resolve-modal';
import { FigmaConnectionResultDetail } from './figma-connection-result-detail';

interface FigmaConnectionTestButtonProps extends UseFigmaMcpConnectionTestProps {
  className?: string;
  buttonLabel?: string;
  connectionStatusTitle?: string;
  showDetectedCounts?: boolean;
}

export function FigmaConnectionTestButton({
  className,
  buttonLabel = 'Test connection',
  connectionStatusTitle,
  showDetectedCounts = true,
  ...hookProps
}: FigmaConnectionTestButtonProps) {
  const {
    isLoading,
    isResetting,
    isWaiting,
    result,
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
    hasTestedConnection,
    apiHealthHref,
    handleTest,
    handleResolveConnection,
    openResolveModal,
    closeResolveModal,
    setResolveConfirmed,
  } = useFigmaMcpConnectionTest(hookProps);
  const { connectionState } = useFigmaMcpStatus();

  const { disabled = false } = hookProps;

  return (
    <>
      <div className={cn('min-w-0 w-full space-y-3 p-5', className)}>
        {connectionStatusTitle ? (
          <p className="text-sm text-muted-foreground">{connectionStatusTitle}</p>
        ) : null}
        <FigmaConnectionRecoveryStepper
          showRecoveryStepper={showRecoveryStepper}
          activeRecoveryStep={activeRecoveryStep}
          isResetting={isResetting}
          isWaiting={isWaiting}
          resetSecondsLeft={resetSecondsLeft}
          waitSecondsLeft={waitSecondsLeft}
        />

        {connectionState.state !== 'connected' ? (
          <FigmaConnectionHealthSummary connectionHealth={connectionHealth} />
        ) : null}

        <FigmaConnectionResultDetail
          result={result}
          showRecoveryStepper={showRecoveryStepper}
          showDetectedCounts={showDetectedCounts}
          isPluginVersionMismatch={isPluginVersionMismatch}
          isNotConnected={isNotConnected}
          apiHealthHref={apiHealthHref}
        />
      </div>

      <ModalFooter>
        <FigmaConnectionActions
          size="default"
          buttonLabel={buttonLabel}
          uiState={{
            disabled,
            isLoading,
            isResetting,
            isWaiting,
            canResolve,
            isRecoveryActive,
            isConnected: result?.connected === true,
            hasTestedConnection,
          }}
          uiActions={{
            onTest: () => void handleTest(),
            onOpenResolveModal: openResolveModal,
          }}
        />
      </ModalFooter>

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
    </>
  );
}
